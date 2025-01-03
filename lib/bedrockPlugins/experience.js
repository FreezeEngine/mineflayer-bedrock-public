module.exports = inject

function inject (bot) {
  bot.experience = {
    level: null,
    points: null,
    progress: null
  }
  bot.on('entityAttributes', (entity) => {
    if (entity !== bot.entity) return
    if(!entity.attributes) return
    if("minecraft:player.level" in entity.attributes) {
      bot.experience.level = entity.attributes["minecraft:player.level"].value
    }
    if("minecraft:player.experience" in entity.attributes) {
      let attribute = entity.attributes["minecraft:player.experience"]
      bot.experience.points = attribute.value
      // something wrong here !
      bot.experience.progress = ((attribute.value - attribute.default) / (attribute.max - attribute.default)) * 100;
    }
    bot.emit('experience')
  })
}
