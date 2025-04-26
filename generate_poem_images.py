import os
import sys
import json
import glob
import time
import random
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
from io import BytesIO
import logging
import hashlib
import base64
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("poem-images")

# Load environment variables from .env file
load_dotenv()
logger.info("Loaded environment variables from .env file")

# Debug environment setup
logger.info("Starting image generation script")
api_key = os.environ.get("GOOGLE_API_KEY")
logger.info(f"API key set: {'Yes' if api_key else 'No'}")
if api_key:
    logger.info(f"API key length: {len(api_key)} characters")
else:
    logger.error("GOOGLE_API_KEY environment variable not set")
    sys.exit(1)

# Configure the client
try:
    logger.info("Initializing Google Generative AI client")
    client = genai.Client(api_key=api_key)
    logger.info("Successfully initialized client")
except ImportError:
    logger.error("Failed to import google.generativeai. Make sure it's installed.")
    sys.exit(1)
except Exception as e:
    logger.error(f"Error configuring genai client: {e}")
    sys.exit(1)

# Set the image generation model
IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation"
logger.info(f"Using image generation model: {IMAGE_MODEL}")

# Rate limiting configuration
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 2  # seconds
MAX_RETRY_DELAY = 60     # seconds
BASE_DELAY_BETWEEN_CALLS = 1  # seconds

# Directory to store prompt checksums for idempotency
CHECKSUM_DIR = ".image_checksums"
os.makedirs(CHECKSUM_DIR, exist_ok=True)

def get_prompt_checksum(prompt):
    """Generate a checksum for a prompt to track whether it has been processed"""
    return hashlib.md5(prompt.encode('utf-8')).hexdigest()

def is_prompt_processed(prompt, output_path):
    """Check if this exact prompt has already been processed for this image"""
    checksum = get_prompt_checksum(prompt)
    checksum_file = os.path.join(CHECKSUM_DIR, f"{os.path.basename(output_path)}.md5")
    
    # If image exists but no checksum, consider it unprocessed
    if not os.path.exists(checksum_file):
        return False
    
    # Read stored checksum
    with open(checksum_file, 'r') as f:
        stored_checksum = f.read().strip()
    
    # Return whether checksums match
    return stored_checksum == checksum

def mark_prompt_processed(prompt, output_path):
    """Mark a prompt as processed by saving its checksum"""
    checksum = get_prompt_checksum(prompt)
    checksum_file = os.path.join(CHECKSUM_DIR, f"{os.path.basename(output_path)}.md5")
    
    with open(checksum_file, 'w') as f:
        f.write(checksum)

def exponential_backoff(retry_count):
    """Calculate delay with exponential backoff and jitter"""
    delay = min(MAX_RETRY_DELAY, INITIAL_RETRY_DELAY * (2 ** retry_count))
    # Add jitter (±20% randomness)
    jitter = random.uniform(0.8, 1.2)
    return delay * jitter

def save_raw_image_data(image_data, filename="raw_image_data.bin"):
    """Save raw image data for debugging"""
    try:
        with open(filename, "wb") as f:
            f.write(image_data)
        logger.info(f"Saved raw image data ({len(image_data)} bytes) to {filename}")
        return True
    except Exception as e:
        logger.error(f"Failed to save raw image data: {e}")
        return False

def generate_test_image():
    """Generate a single test image to verify the API works"""
    
    try:
        # Test prompt 
        prompt = "Black and white, low fidelity sketch style (5x7 inches) of a Taj Mahal, Indian style"
        
        logger.info(f"Generating test image with prompt: {prompt}")
        
        # Generate image using the client
        response = client.models.generate_content(
            model=IMAGE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE']
            )
        )
        
        # Process the response
        image_saved = False
        for part in response.candidates[0].content.parts:
            # Handle text responses
            if hasattr(part, 'text') and part.text is not None:
                logger.info(f"Text response: {part.text[:100]}...")
                
            # Handle image data
            if hasattr(part, 'inline_data') and part.inline_data is not None:
                try:
                    # Save the image using PIL
                    image = Image.open(BytesIO(part.inline_data.data))
                    image.save("test_image.png")
                    logger.info(f"Successfully saved test_image.png: format={image.format}, size={image.size}")
                    image_saved = True
                except Exception as e:
                    logger.error(f"Error saving image: {e}")
        
        if not image_saved:
            logger.warning("No image data found in response")
            return False
            
        return True
    
    except Exception as e:
        logger.error(f"Error generating test image: {e}")
        return False

def generate_image_from_prompt(prompt):
    """Generate an image using Gemini model with rate limit handling"""
    retry_count = 0
    
    while retry_count < MAX_RETRIES:
        try:
            # Add delay between API calls to prevent rate limiting
            if retry_count > 0:
                delay = exponential_backoff(retry_count)
                logger.info(f"Retrying in {delay:.2f} seconds (attempt {retry_count+1}/{MAX_RETRIES})")
                time.sleep(delay)
            else:
                # Small delay between regular calls
                time.sleep(BASE_DELAY_BETWEEN_CALLS)
            
            # Generate image
            response = client.models.generate_content(
                model=IMAGE_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=['TEXT', 'IMAGE']
                )
            )
            
            # Process the response
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data is not None:
                    try:
                        # Create an image from the inline data
                        image = Image.open(BytesIO(part.inline_data.data))
                        # Convert the image to bytes for returning
                        img_byte_arr = BytesIO()
                        image.save(img_byte_arr, format=image.format or 'PNG')
                        return img_byte_arr.getvalue()
                    except Exception as e:
                        logger.error(f"Error processing image data: {e}")
            
            logger.warning("No valid image data found in response")
            return None
            
        except Exception as e:
            error_message = str(e).lower()
            logger.error(f"Error details: {error_message}")
            
            # Check for rate limit related errors
            if any(msg in error_message for msg in ["rate limit", "quota", "429", "too many requests", "resource exhausted"]):
                retry_count += 1
                logger.warning(f"Rate limit hit: {e}")
                if retry_count >= MAX_RETRIES:
                    logger.error(f"Max retries exceeded for rate limiting")
                    return None
            elif "internal server error" in error_message or "503" in error_message:
                # Server errors - also apply backoff
                retry_count += 1
                logger.warning(f"Server error: {e}")
                if retry_count >= MAX_RETRIES:
                    logger.error(f"Max retries exceeded for server error")
                    return None
            else:
                # Other errors, don't retry
                logger.error(f"Error generating image: {e}")
                return None
    
    return None

def process_metadata_files():
    """Process all metadata files and generate images"""
    # Find all poem folders
    poem_folders = [f"{i}/poems" for i in range(1, 7) if os.path.exists(f"{i}/poems")]
    
    # Check if we should use the poems directory instead
    if os.path.exists("poems"):
        poem_folders = ["poems"]
        logger.info("Using 'poems' directory for processing")
    
    if not poem_folders:
        logger.error("No poem folders found. Exiting.")
        return 0, 0, 0
    
    # Count total files to process
    total_files = sum(len(glob.glob(f"{folder}/*.metadata.json")) for folder in poem_folders)
    processed = 0
    failures = 0
    skipped = 0
    
    logger.info(f"Found {total_files} metadata files to process")
    
    for folder in poem_folders:
        # Find all metadata files in the folder
        metadata_files = glob.glob(f"{folder}/*.metadata.json")
        
        for metadata_file in metadata_files:
            base_name = os.path.basename(metadata_file).replace('.metadata.json', '')
            output_image_path = f"{folder}/{base_name}.png"
            
            # Skip if image already exists (regardless of prompt changes)
            if os.path.exists(output_image_path):
                logger.info(f"SKIPPED: Image already exists: {output_image_path}")
                skipped += 1
                processed += 1
                continue
            
            # Read metadata file
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                
                if 'image_prompt' in metadata:
                    image_prompt = metadata['image_prompt']
                    
                    logger.info(f"Generating image for: {base_name}")
                    logger.info(f"Prompt: {image_prompt}")
                    
                    # Generate image
                    image_data = generate_image_from_prompt(image_prompt)
                    
                    if image_data:
                        # Save image directly to file first
                        with open(output_image_path, "wb") as f:
                            f.write(image_data)
                        
                        # Mark prompt as processed for this image
                        mark_prompt_processed(image_prompt, output_image_path)
                        logger.info(f"Saved image to: {output_image_path}")
                    else:
                        logger.error(f"Failed to generate image for: {base_name}")
                        failures += 1
                else:
                    logger.warning(f"No image prompt found in metadata: {metadata_file}")
                    failures += 1
            except Exception as e:
                logger.error(f"Error processing {metadata_file}: {e}")
                failures += 1
            
            processed += 1
            logger.info(f"Progress: {processed}/{total_files} ({processed/total_files*100:.1f}%)")
            
            # Add a delay between processing files to prevent rate limiting
            time.sleep(random.uniform(1, 3))
    
    return processed, skipped, failures

if __name__ == "__main__":
    logger.info("Starting test image generation...")
    success = generate_test_image()
    if success:
        logger.info("Test completed successfully!")
        logger.info("Processing all metadata files...")
        processed, skipped, failures = process_metadata_files()
        logger.info(f"Processing complete! Processed: {processed}, Skipped: {skipped}, Failures: {failures}")
    else:
        logger.error("Test failed to generate image")
        sys.exit(1) 