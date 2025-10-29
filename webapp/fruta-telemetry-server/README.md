# FRUTA Telemetry Server

## Overview
The FRUTA Telemetry Server is a Node.js application that retrieves images and telemetry data from Azure Blob Storage and serves it to clients for viewing on a web interface. This project is designed to facilitate the monitoring and analysis of telemetry data related to fruit harvesting.

## Project Structure
```
fruta-telemetry-server
├── src
│   ├── server.ts               # Entry point of the server application
│   ├── app.ts                  # Configures the Express application
│   ├── routes
│   │   └── api.ts              # Defines API routes for the application
│   ├── controllers
│   │   └── blobController.ts    # Handles requests related to blob storage
│   ├── services
│   │   └── blobService.ts       # Interacts with Azure Blob Storage
│   ├── middleware
│   │   └── errorHandler.ts      # Middleware for error handling
│   ├── config
│   │   └── index.ts             # Configuration settings for the application
│   ├── types
│   │   └── index.ts             # TypeScript interfaces and types
│   └── public
│       └── index.html           # Front-end HTML file
├── package.json                 # npm configuration file
├── tsconfig.json                # TypeScript configuration file
├── .env.example                 # Example of environment variables
├── .gitignore                   # Files and directories to ignore by Git
└── README.md                    # Documentation for the project
```

## Installation
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/fruta-telemetry-server.git
   ```
2. Navigate to the project directory:
   ```
   cd fruta-telemetry-server
   ```
3. Install the dependencies:
   ```
   npm install
   ```

## Configuration
- Create a `.env` file in the root directory and populate it with the necessary environment variables. You can use the `.env.example` file as a reference.

## Running the Application
To start the server, run the following command:
```
npm start
```
The server will be available at `http://localhost:3000`.

## Usage
- Access the front-end application by navigating to `http://localhost:3000` in your web browser.
- The application allows users to view the latest images and telemetry data retrieved from Azure Blob Storage.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.