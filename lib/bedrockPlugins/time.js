module.exports = inject

function inject (bot) {
  bot.time = {
    doDaylightCycle: null,
    bigTime: null,
    time: null,
    timeOfDay: null,
    day: null,
    isDay: null,
    moonPhase: null,
    bigAge: null,
    age: null
  }
  bot._client.on('set_time', (packet) => {
    let time = packet.time
    bot.time.doDaylightCycle = true
    bot.time.time = time
    bot.time.timeOfDay = bot.time.time % 24000
    bot.time.day = Math.floor(bot.time.time / 24000)
    bot.time.isDay = bot.time.timeOfDay < 13000 || bot.time.timeOfDay >= 23000
    bot.time.moonPhase = bot.time.day % 8

    bot.emit('time')
  })
}