import csv
from pymongo import MongoClient
import os # For better path handling

# --- Configuration ---
MONGO_URI = "mongodb+srv://ranilekarlkenneth:Sasaki1027@cluster1.0gaty.mongodb.net/"  
DATABASE_NAME = "Sasaki_Coating_MasterDB"
COLLECTION_NAME = "masterDB"
# !!! REPLACE with the actual path to your CSV file !!!
# Example for Windows: "C:/Users/YourUser/Documents/board_data_only.csv"
# Example for macOS/Linux: "/home/youruser/documents/board_data_only.csv"
CSV_FILE_PATH = "/Users/karlsome/Downloads/boarddata.csv"

# --- Column Names from your CSV (should match exactly) ---
# These are assumed to be the headers in your CSV file containing only 品番 and Board Data.
HINBAN_COLUMN = "品番"
BOARD_DATA_COLUMN = "Board Data"

def update_mongodb_with_board_data():
    """
    Connects to MongoDB, reads a CSV file, and updates documents
    in the specified collection by adding or setting a 'boardData' field.
    The 'boardData' is created by splitting the CSV's 'Board Data' column by commas.
    """
    
    # Check if CSV file exists
    if not os.path.exists(CSV_FILE_PATH):
        print(f"Error: CSV file not found at '{CSV_FILE_PATH}'")
        print("Please check the CSV_FILE_PATH variable in the script.")
        return
    if not os.path.isfile(CSV_FILE_PATH):
        print(f"Error: CSV_FILE_PATH '{CSV_FILE_PATH}' is a directory, not a file.")
        return

    try:
        client = MongoClient(MONGO_URI)
        # The ismaster command is cheap and does not require auth.
        client.admin.command('ismaster')
        print("Successfully connected to MongoDB.")
    except Exception as e:
        print(f"Error connecting to MongoDB at '{MONGO_URI}': {e}")
        print("Please check your MONGO_URI and ensure MongoDB is running.")
        return

    db = client[DATABASE_NAME]
    collection = db[COLLECTION_NAME]

    updated_count = 0
    modified_actually_count = 0
    not_found_count = 0
    skipped_empty_hinban = 0
    errors = []

    print(f"\nProcessing CSV file: '{CSV_FILE_PATH}'")
    print(f"Targeting Database: '{DATABASE_NAME}', Collection: '{COLLECTION_NAME}'")

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='shift_jis') as csvfile: # Changed encoding to shift_jis
            reader = csv.DictReader(csvfile)

            # Verify headers
            if HINBAN_COLUMN not in reader.fieldnames or BOARD_DATA_COLUMN not in reader.fieldnames:
                print(f"\nCritical Error: Required columns ('{HINBAN_COLUMN}', '{BOARD_DATA_COLUMN}') not found in CSV headers.")
                print(f"Available headers in '{os.path.basename(CSV_FILE_PATH)}': {reader.fieldnames}")
                print("Please ensure your CSV file has the correct headers.")
                client.close()
                return

            print(f"CSV Headers found: {reader.fieldnames}. Looks good.")
            print("Starting update process...\n")

            for row_num, row in enumerate(reader, 1):
                try:
                    hinban = row.get(HINBAN_COLUMN, "").strip() # Use .get for safety
                    board_data_str = row.get(BOARD_DATA_COLUMN, "").strip() # Use .get for safety

                    if not hinban:
                        # print(f"Skipping row {row_num} due to empty 品番.")
                        skipped_empty_hinban += 1
                        continue

                    # Convert board_data_str to an array of strings
                    # Handle cases where board_data_str might be empty or just whitespace
                    if board_data_str:
                        board_data_array = [item.strip() for item in board_data_str.split(',') if item.strip()]
                    else:
                        board_data_array = [] # Store as empty array if CSV field is empty

                    # Find the document by 品番 and update it
                    # Set upsert=False if you ONLY want to update existing documents.
                    # Set upsert=True if you want to create new documents if 品番 doesn't exist.
                    # Given the context, upsert=False is safer for an "update" operation.
                    result = collection.update_one(
                        {HINBAN_COLUMN: hinban},                     # Filter to find the document
                        {"$set": {"boardData": board_data_array}},   # Field to add/update
                        upsert=False                                 # IMPORTANT: Set to True to insert if not found
                    )

                    if result.matched_count > 0:
                        updated_count += 1
                        if result.modified_count > 0:
                            modified_actually_count +=1
                        # else:
                            # print(f"Row {row_num}: 品番 '{hinban}' found, but 'boardData' was already the same or no change needed.")
                    else:
                        not_found_count += 1
                        # print(f"Row {row_num}: 品番 '{hinban}' not found in MongoDB collection. (upsert=False)")

                except Exception as e:
                    error_msg = f"Error processing CSV row {row_num} (品番: {hinban if 'hinban' in locals() else 'N/A'}): {e}"
                    # print(error_msg) # You might want to uncomment this for debugging individual row errors
                    errors.append(error_msg)
    
    except FileNotFoundError:
        print(f"Error: The file '{CSV_FILE_PATH}' was not found.")
        client.close()
        return
    except Exception as e:
        print(f"An unexpected error occurred during CSV processing or MongoDB interaction: {e}")
        client.close()
        return

    print("\n--- Update Summary ---")
    print(f"Total rows processed in CSV (excluding header): {row_num if 'row_num' in locals() else 0}")
    print(f"Rows skipped due to empty 品番: {skipped_empty_hinban}")
    print(f"Documents matched in MongoDB: {updated_count}")
    print(f"Documents actually modified in MongoDB: {modified_actually_count}")
    print(f"品番 from CSV not found in MongoDB (and not upserted): {not_found_count}")
    
    if errors:
        print(f"Errors encountered during processing: {len(errors)}")
        # If you want to see all errors, uncomment the following lines:
        # print("First 5 errors:")
        # for i, err in enumerate(errors[:5]):
        #    print(f"  - {err}")
    else:
        print("No errors encountered during processing.")

    client.close()
    print("MongoDB connection closed.")

if __name__ == "__main__":
    print("--------------------------------------------------------------------")
    print("This script will update MongoDB documents based on a CSV file.")
    print("IMPORTANT: Ensure you have backed up your MongoDB database before proceeding.")
    print("--------------------------------------------------------------------")
    
    # You can uncomment the input line for a manual confirmation step
    # confirmation = input("Have you backed up your database and configured the script correctly? (yes/no): ")
    # if confirmation.lower() == 'yes':
    #     update_mongodb_with_board_data()
    # else:
    #     print("Script execution cancelled by user.")

    # Or run directly after reviewing the configurations:
    update_mongodb_with_board_data()