const { Vec3 } = require('vec3')

module.exports = inject

function inject (bot) {
  bot._client.on('play_sound', (packet) => {
    const soundName = packet.name
    const volume = packet.volume
    const pitch = packet.pitch

    bot.emit('soundEffectHeard', soundName, packet.coordinates, volume, pitch)
  })

  bot._client.on('level_sound_event', (packet) => {
    const soundId = packet.sound_id // diff field type
    const soundCategory = packet.extra_data // diff field type
    const volume = 1
    const pitch = 1

    bot.emit('hardcodedSoundEffectHeard', soundId, soundCategory, packet.position, volume, pitch)
  })

  bot._client.on('level_event', (packet) => {
    if (packet.event.indexOf('sound')!==-1) {
      const soundId = packet.event // diff field type
      const soundCategory = packet.data // diff field type
      const volume = 1
      const pitch = 1

      bot.emit('hardcodedSoundEffectHeard', soundId, soundCategory, packet.position, volume, pitch)
    }
  })
}
