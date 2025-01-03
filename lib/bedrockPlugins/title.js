module.exports = inject

function inject (bot) {
  bot._client.on('set_title', (packet) => { // req checking
    if (packet.type === "set_title") {
      bot.emit('title', packet.text)
    }
  })
}
