# Slither.io Clone - High Performance Edition

This is a highly optimized Slither.io clone designed to run on low-resource environments like **Render's Free Tier (512MB RAM)** while supporting up to **100 concurrent players**.

## 🚀 Key Features

-   **Client-Side Physics**: Movement and collision detection are handled by the client to minimize server CPU and RAM usage.
-   **Low Memory Footprint**: The server stores only essential player data, easily fitting within 512MB of RAM.
-   **Mobile Support**: Optimized touch controls, responsive UI, and a dedicated "Boost" button for mobile players.
-   **Smooth Gameplay**: Uses 20FPS server synchronization with local interpolation for a fluid experience.
-   **Render Ready**: Includes `render.yaml` for instant deployment.

## 🛠️ How to Run Locally

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the server:**
    ```bash
    npm start
    ```

3.  **Play:**
    Open `http://localhost:3000` in your browser.

## 🌐 Deployment on Render

This project is configured for Render's **Blueprint** deployment.

1.  Create a free account on [Render](https://render.com/).
2.  Connect your GitHub repository.
3.  Select the `render.yaml` file when prompted or create a new **Blueprint Instance**.
4.  The server will automatically deploy and be available at your Render URL.

## 📝 Technical Details

-   **Server**: Node.js + Express + WebSockets (ws).
-   **Frontend**: Vanilla JS + HTML5 Canvas.
-   **Networking**: Optimized JSON synchronization.
-   **Mobile**: Touch-event handling with virtual joystick/button support.

## ⚖️ Disclaimer

To achieve maximum performance and 100+ player support on a 512MB RAM server, this version trusts the client for movement and collisions (minimal anti-cheat).
