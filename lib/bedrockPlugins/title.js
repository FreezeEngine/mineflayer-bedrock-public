module.exports = inject

function inject (bot) {
  bot._client.on('set_title', (packet) => {
    if (packet.type === 'set_title') {
      bot.emit('title', packet.text, 'title')
    }
    if(packet.type === 'set_subtitle') {
      bot.emit('title', packet.text, 'subtitle')
    }
  })
}