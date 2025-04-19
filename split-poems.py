import re
import os
from datetime import datetime

def parse_poems(input_file):
    """
    Parse poems from the input file and save each poem to a separate file.
    """
    try:
        # Read the input file
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split the content by poem sections
        # Updated pattern to match the actual format in the file
        poem_pattern = r'---\s*([0-9]{1,2}[\s-]+[A-Za-z]{3,9}[\s-]+[0-9]{4})\s*\n---\s*([^\n]+)((?:.|\n)*?)(?=---\s*[0-9]|\Z)'
        poems = re.findall(poem_pattern, content)
        
        # Create a directory to store the poem files if it doesn't exist
        os.makedirs('poems', exist_ok=True)
        
        # Process each poem
        for date, title, poem_text in poems:
            # Clean up the date and title
            date = date.strip()
            title = title.strip()
            poem_text = poem_text.strip()
            
            # Convert date to YYYY-MM-DD format
            try:
                # Try multiple date formats
                for fmt in ['%d %b-%Y', '%d %b %Y', '%d-%b-%Y', '%d- %b-%Y', 
                           '%d-%B-%Y', '%d %B-%Y', '%d-%B %Y', '%d %B %Y', 
                           '%d-%b %Y', '%d- %B-%Y', '%d- %b %Y', '%d-%Sept-%Y', 
                           '%d-Sept-%Y', '%d Sept-%Y', '%d-Sept %Y', '%d Sept %Y']:
                    try:
                        parsed_date = datetime.strptime(date, fmt)
                        date_formatted = parsed_date.strftime('%Y-%m-%d')
                        break
                    except ValueError:
                        continue
                else:
                    # If no format worked, use the original date with hyphens
                    print(f"Warning: Could not parse date '{date}', using original format")
                    date_formatted = date.replace(' ', '-')
            except Exception as e:
                print(f"Error parsing date '{date}': {e}")
                date_formatted = date.replace(' ', '-')
            
            # Create a valid filename
            filename = f"{date_formatted}_{title}.txt"
            # Replace any characters that are not valid in filenames
            filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
            filepath = os.path.join('poems', filename)
            
            # Write the poem to a file
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(poem_text)
            
            print(f"Created file: {filepath}")
        
        print(f"Total poems processed: {len(poems)}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    parse_poems('/Users/vinaywadhwa/Desktop/untitled folder/6/poems.txt')
    
