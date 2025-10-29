# FRUTA Telemetry Viewer

## Overview
The FRUTA Telemetry Viewer is a Flask-based web application designed to display images and telemetry data from Azure Blob Storage. Users can view the latest images captured by the telemetry system and click on them to see corresponding telemetry messages.

## Project Structure
```
fruta-telemetry-server
├── app.py                  # Entry point of the Flask application
├── requirements.txt        # Project dependencies
├── .env.example            # Example environment variables
├── README.md               # Project documentation
├── templates               # HTML templates
│   └── index.html         # Main template for the telemetry viewer
├── static                  # Static files (CSS, JS)
│   ├── js
│   │   └── main.js        # JavaScript for user interactions
│   └── css
│       └── styles.css     # Styles for the application
├── services                # Service layer for Azure Blob Storage interactions
│   └── blob.py            # Functions for listing and fetching blobs
├── api                     # API routes
│   └── routes.py          # Defines API endpoints
└── tests                   # Unit tests
    └── test_app.py        # Tests for the application
```

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd fruta-telemetry-server
   ```

2. **Create a Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**
   - Copy `.env.example` to `.env` and fill in the required values:
     ```
     AZURE_STORAGE_ACCOUNT=<your_account_name>
     AZURE_STORAGE_SAS_TOKEN=<your_sas_token>
     ```

5. **Run the Application**
   ```bash
   python app.py
   ```

6. **Access the Application**
   Open your web browser and navigate to `http://localhost:5000` to view the telemetry data.

## Usage
- The main page displays the latest images from Azure Blob Storage.
- Click on an image to view its associated telemetry messages.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.