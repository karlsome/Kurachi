from flask import Flask, request
from flask_cors import CORS
import time
import pyautogui
from pywinauto import Desktop

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def activate_xiao_app():
    try:
        # Find a visible window with "xiao" in the title (case-insensitive)
        window = Desktop(backend="uia").window(title_re=".*xiao.*", visible_only=True)

        if window.exists():
            window.set_focus()
            window.maximize()
            print(f"Activated: {window.window_text()}")
            time.sleep(2)
        else:
            print("Xiao app window not found.")
    except Exception as e:
        print(f"Failed to activate Xiao app: {e}")

def automate_xiao(filename):
    activate_xiao_app()
    
    

    # File -> Open
    pyautogui.hotkey('alt', 'f')
    time.sleep(1)
    pyautogui.press('o')
    print("Pressed 'o' for Open")
    time.sleep(1)
    pyautogui.press('enter')
    time.sleep(1)

    # Enter filename
    pyautogui.typewrite(filename)
    print(f"Typed filename: {filename}")
    time.sleep(1)
    pyautogui.press('enter')
    time.sleep(1)

    # Send to machine
    pyautogui.hotkey('alt', 'o')
    time.sleep(1)
    pyautogui.press('s')
    time.sleep(1)
    pyautogui.press('enter')
    time.sleep(1)
    pyautogui.press('enter')
    time.sleep(1)
    pyautogui.press('enter')
    time.sleep(1)

    # Press ESC to dismiss any popups
    pyautogui.press('esc')
    time.sleep(1)

@app.route('/request', methods=['GET'])
def handle_request():
    filename = request.args.get('filename')
    if filename:
        print(f"Received request to open file: {filename}")
        automate_xiao(filename)
        return f"Processing file: {filename}", 200
    else:
        return "No filename provided", 400

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
