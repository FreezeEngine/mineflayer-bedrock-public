module.exports = inject

function inject (bot) {
  bot._client.on('set_entity_data', (packet) => {
    if (!bot?.entity?.id === packet?.runtime_entity_id) return
    if (packet?.metadata[1]?.key === 'air') {
      if (!packet?.metadata[1]?.value) return
      bot.oxygenLevel = Math.round(packet.metadata[1].value / 15)
      bot.emit('breath')
    }
    if (packet?.metadata[0]?.key === 'air') {
      if (!packet?.metadata[0]?.value) return
      bot.oxygenLevel = Math.round(packet.metadata[0].value / 15)
      bot.emit('breath')
    }
  })
}
