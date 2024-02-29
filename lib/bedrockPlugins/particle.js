const { Vec3 } = require('vec3')
module.exports = inject
// REQ BEDROCK PARTICLES IMPLEMENTATION
function inject (bot, { version }) {
  const Particle = require('../particle')(bot.registry)

  bot._client.on('level_event', (packet) => {
    bot.emit('particle', new Particle(packet.event, packet.position, new Vec3(0,0,0)))
  })
  bot._client.on('spawn_particle_effect', (packet) => {
    bot.emit('particle', new Particle(packet.particle_name, packet.position, new Vec3(0,0,0)))
  })
}
