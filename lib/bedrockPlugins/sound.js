const { Vec3 } = require('vec3')

module.exports = inject

function inject(bot) {
  bot._client.on('level_sound_event', (packet) => {

    const soundId = packet.sound_id
    const pt = new Vec3(packet.position.x, packet.position.y, packet.position.z)
    const volume = packet.extra_data // Unknown field (-1 on inspected sounds minecraft:wolf)
    const pitch = 1.0 // Pitch not included in packet
    const isGlobal = packet.is_global

    bot.emit('soundEffectHeard', soundId, pt, volume, pitch, isGlobal)
  })

}
