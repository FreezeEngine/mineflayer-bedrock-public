module.exports = inject

function inject (bot) {
  bot.isAlive = true

  bot._client.on('respawn', (packet) => {
    bot.isAlive = packet.state === 1
    if(!bot.isAlive) { // matching to mineflayer API
      bot.emit('respawn')
    }
  })

  bot._client.once('set_health', (packet) => {
    if (packet.health > 0) {
      bot.isAlive = true
      bot.emit('spawn')
    }
  })
  bot._client.on('set_health', (packet) => {
    bot.health = packet.health
    bot.food = 20 //packet.food 20
    bot.foodSaturation = 20 //packet.foodSaturation
    bot.isAlive = true
    bot.emit('health')
  })
  bot._client.on('update_health', (packet) => {
    bot.health = packet.health
    bot.food = packet.food
    bot.foodSaturation = packet.foodSaturation
    bot.emit('health')
    if (bot.health <= 0) {
      if (bot.isAlive) {
        bot.isAlive = false
        bot.emit('death')
      }
      //handle respawn
    } else if (bot.health > 0 && !bot.isAlive) {
      bot.isAlive = true
      bot.emit('spawn')
    }
  })
}
