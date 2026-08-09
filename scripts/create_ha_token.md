# Creating a Home Assistant Long-Lived Access Token

The AI-generated dashboard needs a token to read states and call services over the WebSocket API.

1. Open Home Assistant in a browser.
2. Click your user profile (bottom-left corner).
3. Scroll to **Long-Lived Access Tokens**.
4. Click **Create Token**.
5. Give it a name like `AI Dashboard` and click **OK**.
6. Copy the token immediately — it is shown only once.
7. Paste it into the prompt when the dashboard first loads.

The token is stored in your browser's localStorage for that device only. It is never included in the generated HTML file.
