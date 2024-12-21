const mineflayer = require('mineflayer');
const bot = mineflayer.createBot({
    host: '0.0.0.0',   // Minecraft server IP
    port: 19132,              // Minecraft Bedrock server port
    auth: 'microsoft',       // Use Microsoft authentication
    version: 'bedrock_1.21.50' // Specify the Bedrock version
});

// Event listener to log when the bot connects
bot.on('spawn', () => {
    console.log('Bot spawned!');
});

// Log errors
bot.on('error', (err) => console.error(err));
bot.on('end', () => console.log('Bot disconnected.'));
