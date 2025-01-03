module.exports = inject

function inject (bot) {
  bot._client.on('disconnect', (packet) => {
    const kicked = packet.reason.indexOf('kick') !== -1
    bot.emit('kicked', packet.message ?? packet.reason, kicked)

  })
  bot.quit = (reason) => {
    reason = reason ?? 'disconnect.quitting'
    bot.end(reason)
  }
}
