# Mini PC Flask Server - Setup Instructions

## Overview
This Flask server runs on the mini PC connected to the NC cutting machine. It receives HTTP requests from the web app (running on tablets) and automates the Xiao application using PyAutoGUI.

## Changes Made

### 1. **Updated Flask Server (mini_pc_server.py)**
- Added CORS support to allow requests from the web app hosted on render.com
- Enabled cross-origin requests from tablets on the same LAN

### 2. **Updated Web App (DCP backend.js)**
- Changed `sendtoNC()` function to use `fetch()` instead of opening new tabs
- Added async/await support
- Includes fallback to old method if fetch fails

## Installation on Mini PC

### Step 1: Install flask-cors
```bash
pip install flask-cors
```

### Step 2: Run the Server
```bash
python mini_pc_server.py
```

The server will start on `http://0.0.0.0:5000` and accept requests from any device on the same network.

## How It Works

### From the Tablet/Web App:
1. User clicks "Send to Machine" button (or Step 3 modal button)
2. JavaScript sends a `fetch()` request to `http://{mini-pc-ip}:5000/request?filename={背番号}.pce`
3. Request uses `mode: 'no-cors'` to bypass CORS preflight checks
4. If fetch fails, falls back to opening a new tab (old method)

### On the Mini PC:
1. Flask server receives the GET request
2. Extracts the filename from query parameters
3. Calls `automate_xiao(filename)` to:
   - Activate the Xiao application window
   - Open the file using keyboard shortcuts
   - Send to the machine
4. Returns success response

## Security Notes

### CORS Configuration
- The Flask server uses `CORS(app)` to allow all origins
- This is safe because the server only runs on the local network
- The mini PC is not accessible from the internet

### Mixed Content (HTTPS → HTTP)
- Web app on render.com uses HTTPS
- Mini PC server uses HTTP
- Using `mode: 'no-cors'` in fetch allows this
- Browser will send the request but won't read the response (which is fine - we only need to trigger the command)

## Testing

### 1. Find Mini PC IP Address
On the mini PC, run:
```bash
ipconfig
```
Look for the IPv4 address (e.g., 192.168.1.100)

### 2. Test from Browser
Open browser on tablet and visit:
```
http://192.168.1.100:5000/request?filename=TEST001.pce
```

You should see: "Processing file: TEST001.pce"

### 3. Test from Web App
1. Make sure the mini PC IP is stored in the app (ipInfo field)
2. Click "Send to Machine" button
3. Check browser console for:
   - "Sending command to mini PC: http://..."
   - "Command sent successfully to mini PC"
4. Check mini PC console for:
   - "Received request to open file: {filename}"

## Troubleshooting

### Fetch Fails
If you see "Fetch failed, trying fallback method..." in console:
- Check if mini PC server is running
- Verify IP address is correct
- Check firewall settings on mini PC
- Try accessing `http://{mini-pc-ip}:5000/request?filename=test.pce` directly in browser

### CORS Errors
If you see CORS errors in console:
- Make sure flask-cors is installed
- Verify `CORS(app)` is in the Python code
- Restart the Flask server

### No Response
The fetch request uses `mode: 'no-cors'` which means:
- The request will be sent
- The response cannot be read by JavaScript
- This is expected behavior and perfectly fine for sending commands

## Advantages Over Old Method

✅ **No New Tabs** - Cleaner user experience  
✅ **Silent Operation** - Command sent in background  
✅ **Faster** - No tab opening/closing delay  
✅ **Better Error Handling** - Try/catch with fallback  
✅ **Consistent** - Works same way on Step 3 modal and main page button

## Files Modified
- `DCP backend.js` - Changed sendtoNC() to async with fetch()
- `mini_pc_server.py` - Added CORS support

## Next Steps
1. Copy `mini_pc_server.py` to the mini PC
2. Install flask-cors: `pip install flask-cors`
3. Run the server
4. Test from the tablet
5. Deploy updated `DCP backend.js` to render.com
