module.exports = inject

function inject (bot, { version }) {
  const BossBar = require('../bossbar')(bot.registry)
  const bars = {}

  bot.on('entityGone', (entity) => {
    if (!(entity.unique_id in bars)) {
      return
    }
    bot.emit('bossBarDeleted', bars[entity.unique_id])
    delete bars[entity.unique_id]
  })

  bot._client.on('boss_event', (packet) => {
    if (packet.type === "show_bar") {
      let flags = 0;

      if (packet.screen_darkening === 1) {
        flags |= 0x1;
      }

      bars[packet.boss_entity_id] = new BossBar(
        packet.boss_entity_id,
        packet.title,
        getBossHealth(packet.boss_entity_id),
        4,
        packet.color,
        flags
      )

      bot._client.write('boss_event', {
        "boss_entity_id": packet.boss_entity_id,
        "type": "register_player",
        "player_id": bot.entity.unique_id
      })

      bot.emit('bossBarCreated', bars[packet.boss_entity_id])
    } else if (packet.type === "set_bar_progress") {
      if (!(packet.boss_entity_id in bars)) {
        return
      }

      bars[packet.boss_entity_id].health = getBossHealth(packet.boss_entity_id)


      bot.emit('bossBarUpdated', bars[packet.boss_entity_id])
    }
  })

  function getBossHealth(boss_id) {
    let boss_entity = bot.fetchEntity(boss_id)

    let boss_health = 0

    if ("minecraft:health" in boss_entity.attributes) {
      boss_health = boss_entity.attributes["minecraft:health"].value;
    }

    return boss_health
  }

  Object.defineProperty(bot, 'bossBars', {
    get () {
      return Object.values(bars)
    }
  })
}
