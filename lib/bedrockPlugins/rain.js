module.exports = inject

function inject (bot) {
  bot.isRaining = false
  bot.thunderState = 0
  bot.rainState = 0
  bot._client.on('level_event', (packet) => {
    if (packet.event === "start_rain") {
      bot.isRaining = true
      bot.emit('rain')
    } else if (packet.event === "stop_rain") {
      bot.isRaining = false
      bot.emit('rain')
    } else if (packet.event === "start_thunder") {
      bot.thunderState = 1 // this value requires checking against java
      bot.emit('weatherUpdate')
    } else if (packet.event === "stop_thunder") {
      bot.thunderState = 0 // this value requires checking against java
      bot.emit('weatherUpdate')
    }
  })
}
