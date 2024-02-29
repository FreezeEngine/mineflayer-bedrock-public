const { Vec3 } = require('vec3')
const conv = require('../conversions')
const NAMED_ENTITY_HEIGHT = 1.62
const NAMED_ENTITY_WIDTH = 0.6
const CROUCH_HEIGHT = NAMED_ENTITY_HEIGHT - 0.08

module.exports = inject

function inject (bot) {
  const { mobs, entitiesArray } = bot.registry
  const Entity = require('prismarine-entity')(bot.version)
  const Item = require('prismarine-item')(bot.version)
  const ChatMessage = require('prismarine-chat')(bot.registry)

  bot.findPlayer = bot.findPlayers = (filter) => {
    const filterFn = (entity) => {
      if (entity.type !== 'player') return false
      if (filter === null) return true
      if (typeof filter === 'object' && filter instanceof RegExp) {
        return entity.username.search(filter) !== -1
      } else if (typeof filter === 'function') {
        return filter(entity)
      } else if (typeof filter === 'string') {
        return entity.username.toLowerCase() === filter.toLowerCase()
      }
      return false
    }
    const resultSet = Object.values(bot.entities)
      .filter(filterFn)

    if (typeof filter === 'string') {
      switch (resultSet.length) {
        case 0:
          return null
        case 1:
          return resultSet[0]
        default:
          return resultSet
      }
    }
    return resultSet
  }

  bot.players = {}
  bot.uuidToUsername = {}
  bot.entities = {}

  bot._playerFromUUID = (uuid) => Object.values(bot.players).find(player => player.uuid === uuid)

  bot.nearestEntity = (match = (entity) => { return true }) => {
    let best = null
    let bestDistance = Number.MAX_VALUE

    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity || !match(entity)) {
        continue
      }

      const dist = bot.entity.position.distanceSquared(entity.position)
      if (dist < bestDistance && entity.id) {
        best = entity
        bestDistance = dist
      }
    }

    return best
  }

  // Reset list of players and entities on login
  bot._client.on('start_game', (packet) => {
    bot.players = {}
    bot.uuidToUsername = {}
    bot.entities = {}
    // login
    bot.entity = fetchEntity(packet.runtime_entity_id)
    bot.username = bot._client.username
    bot.entity.username = bot._client.username
    bot.entity.type = 'player'
    bot.entity.name = 'player'
  })

  // bot._client.on('entity_equipment', (packet) => {
  //   // entity equipment
  //   const entity = fetchEntity(packet.entityId)
  //   if (packet.equipments !== undefined) {
  //     packet.equipments.forEach(equipment => entity.setEquipment(equipment.slot, equipment.item ? Item.fromNotch(equipment.item) : null))
  //   } else {
  //     entity.setEquipment(packet.slot, packet.item ? Item.fromNotch(packet.item) : null)
  //   }
  //   bot.emit('entityEquip', entity)
  // })

  bot._client.on('add_player', (packet) => { // CHANGE
    // in case player_info packet was not sent before named_entity_spawn : ignore named_entity_spawn (see #213)
    //if (packet.uuid in bot.uuidToUsername) {
      // spawn named entity
      const runtime_id = packet.runtime_id ?? packet.entity_runtime_id ?? packet.runtime_entity_id
      const entity = fetchEntity(runtime_id)
      entity.type = 'player'
      entity.name = 'player'
      entity.id = runtime_id
      entity.username = bot.uuidToUsername[packet.uuid]
      entity.uuid = packet.uuid
      entity.unique_id = packet.unique_entity_id ?? packet.unique_id
    // entity.dataBlobs = packet.metadata
      if (bot.supportFeature('fixedPointPosition')) {
        entity.position.set(packet.position.x / 32, packet.position.y-NAMED_ENTITY_HEIGHT / 32, packet.position.z / 32)
      } else if (bot.supportFeature('doublePosition')) {
        entity.position.set(packet.position.x, packet.position.y-NAMED_ENTITY_HEIGHT, packet.position.z)
      }else{
        entity.position.set(packet.position.x, packet.position.y-NAMED_ENTITY_HEIGHT, packet.position.z)
      }
      entity.yaw = conv.fromNotchianYawByte(packet.yaw)
      entity.pitch = conv.fromNotchianPitchByte(packet.pitch)
      entity.headYaw = conv.fromNotchianYawByte(packet.head_yaw ?? 0)

      entity.height = NAMED_ENTITY_HEIGHT
      entity.width = NAMED_ENTITY_WIDTH
      entity.metadata = parseMetadata(packet.metadata, entity.metadata)
      if (bot.players[entity.username] !== undefined && !bot.players[entity.username].entity) {
        bot.players[entity.username].entity = entity
      }
      bot.emit('entitySpawn', entity)
    //}
  })

  function setEntityData (entity, type, entityData) {
    if (entityData === undefined) {
      entityData = entitiesArray.find(entity => entity.internalId === type)
    }
    if (entityData) {
      entity.displayName = entityData.displayName
      entity.entityType = entityData.id
      entity.name = entityData.name
      entity.kind = entityData.category
      entity.height = entityData.height
      entity.width = entityData.width
    } else {
      // unknown entity (item entity?)
      entity.type = 'other'
      entity.entityType = type
      entity.displayName = 'unknown'
      entity.name = 'unknown'
      entity.kind = 'unknown'
    }
  }
  function add_entity(packet){
    const entity = fetchEntity(packet.runtime_id ?? packet.runtime_entity_id)
    const entityData = bot.registry.entitiesByName[packet.entity_type?.replace('minecraft:','')]

    entity.type = entityData ? (entityData.type || 'object') : 'object'

    setEntityData(entity, entity.type, entityData)

    if(packet.item){
      entity.type = 'item'
      entity.item = packet.item
    }

    // if (bot.supportFeature('fixedPointPosition')) {
    //   entity.position.set(packet.position.x / 32, packet.position.y / 32, packet.position.z / 32)
    // } else if (bot.supportFeature('doublePosition')) {
    //   entity.position.set(packet.position.x, packet.position.y, packet.position.z)
    // }
    entity.position.set(
      packet.position.x,
      packet.position.y,
      packet.position.z
    )
    entity.velocity.set(
      packet.velocity.x,
      packet.velocity.y,
      packet.velocity.z
    )
    //  else if (bot.supportFeature('consolidatedEntitySpawnPacket')) {
    //   entity.headPitch = conv.fromNotchianPitchByte(packet.headPitch)
    // }

    entity.unique_id = packet.entity_id_self ?? packet.unique_id // 1.19 / 1.18
    if(entity.type !== 'item') { // NEEDS TO BE MOVED SOMEWHERE
      entity.yaw = conv.fromNotchianYawByte(packet.yaw) ?? 0 // conv.fromNotchianYawByte
      entity.pitch = conv.fromNotchianPitchByte(packet.pitch) ?? 0 // conv.fromNotchianPitchByte
      entity.headYaw = conv.fromNotchianPitchByte(packet.head_yaw) ?? 0
    }

    if (packet.links) { // Might be wrong
      for (const link in packet.links) {
        const rider = fetchEntity(link.rider_entity_id)
        rider.vehicle = fetchEntity(link.ridden_entity_id)
        //rider.vehicle.position = rider.position
        bot.emit('entityAttach', rider, rider.vehicle)
      }
    }

    //entity.objectData = packet.objectData
    bot.emit('update_attributes', packet)
    bot.emit('entitySpawn', entity)
  }
  //Add Item Entity !!!

  bot._client.on('add_entity', add_entity)
  bot._client.on('add_item_entity', add_entity)

  bot._client.on('set_entity_motion', (packet) => {
    // entity velocity
    const entity = fetchEntity(packet.runtime_entity_id)
    //console.log(packet.velocity)
    entity.velocity = new Vec3(packet.velocity.x, packet.velocity.y, packet.velocity.z)
  })

  bot._client.on('remove_entity', (packet) => {
    // destroy entity
    const id = packet.entity_id_self
    const entity = fetchEntity(id)
    bot.emit('entityGone', entity)
    entity.isValid = false
    if (entity.username && bot.players[entity.username]) {
      bot.players[entity.username].entity = null
    }
    delete bot.entities[id]
  })
  function movePlayer(packet){
    // entity teleport
    const entity = fetchEntity(packet.runtime_id ?? packet.entity_runtime_id ?? packet.runtime_entity_id)
    const position = packet.player_position ?? packet.position
    // if (bot.supportFeature('fixedPointPosition')) {
    //   entity.position.set(packet.position.x / 32, packet.position.y / 32, packet.position.z / 32)
    // }
    // if (bot.supportFeature('doublePosition')) {
    //   entity.position.set(packet.position.x, packet.position.y, packet.position.z)
    // }
    entity.position.set(position.x, position.y-NAMED_ENTITY_HEIGHT, position.z) // FIND OUT WHY doublePosition NEEDED
    // set rotation !!!
    entity.yaw = conv.fromNotchianYawByte(packet.yaw ?? packet.rotation.z)
    entity.pitch = conv.fromNotchianPitchByte(packet.pitch ?? packet.rotation.x)
    entity.headYaw = conv.fromNotchianYawByte(packet.head_yaw ?? 0)
    bot.emit('playerMoved', entity)
    bot.emit('entityMoved', entity)
  }
  bot._client.on('start_game', movePlayer)
  bot._client.on('move_player', movePlayer)

  bot._client.on('move_entity', (packet)=>{
    // entity teleport
    const entity = fetchEntity(packet.runtime_entity_id)
    // if (bot.supportFeature('fixedPointPosition')) {
    //   entity.position.set(packet.position.x / 32, packet.position.y / 32, packet.position.z / 32)
    // }
    // if (bot.supportFeature('doublePosition')) {
    //   entity.position.set(packet.position.x, packet.position.y, packet.position.z)
    // }
    entity.position.set(packet.position.x, packet.position.y, packet.position.z) // FIND OUT WHY doublePosition NEEDED
    entity.yaw = conv.fromNotchianYawByte(packet.yaw ?? packet.rotation.z)
    entity.pitch = conv.fromNotchianPitchByte(packet.pitch ?? packet.rotation.x)
    entity.headYaw = conv.fromNotchianYawByte(packet.rotation.headYaw ?? 0)

    bot.emit('entityMoved', entity)
  })

  bot._client.on('move_entity_delta', (packet)=>{
    // entity teleport
    const entity = fetchEntity(packet.runtime_entity_id)
      // if (bot.supportFeature('fixedPointPosition')) {
      //   entity.position.set(packet.position.x / 32, packet.position.y / 32, packet.position.z / 32)
      // }
      // if (bot.supportFeature('doublePosition')) {
      //   entity.position.set(packet.position.x, packet.position.y, packet.position.z)
      // }
    entity.position.set(
      packet.x??entity.position.x,
      packet.y??entity.position.y,
      packet.z??entity.position.z) // FIND OUT WHY doublePosition NEEDED
    entity.yaw = conv.fromNotchianYawByte(packet.rot_z ?? entity.yaw)
    entity.pitch = conv.fromNotchianPitchByte(packet.rot_y ?? entity.pitch)
    entity.headYaw = conv.fromNotchianYawByte(packet.rot_x ?? entity.headYaw)

    bot.emit('entityMoved', entity)
  })

  bot._client.on('set_entity_link', (packet) => {
    // attach entity
    const entity = fetchEntity(packet.link.rider_entity_id)
    if (packet.type === 0) {
      const vehicle = entity.vehicle
      delete entity.vehicle
      bot.emit('entityDetach', entity, vehicle)
    } else {
      entity.vehicle = fetchEntity(packet.ridden_entity_id)
      // entity.position = entity.vehicle.position
      // console.log(entity.position)
      bot.emit('entityAttach', entity, entity.vehicle)
    }
  })

  bot._client.on('set_entity_data', (packet) => { // REWRITE TO ADD ENTITY \ PLAYER
    //entity metadata
    const entity = fetchEntity(packet.runtime_entity_id)
    entity.metadata = parseMetadata(packet.metadata, entity.metadata)
    //console.log(packet)
    bot.emit('entityUpdate', entity)

    // const typeSlot = (bot.supportFeature('itemsAreAlsoBlocks') ? 5 : 6) + (bot.supportFeature('entityMetadataHasLong') ? 1 : 0)
    // const slot = packet.metadata.find(e => e.type === typeSlot)
    // if (entity.name && (entity.name.toLowerCase() === 'item' || entity.name === 'item_stack') && slot) {
    //   bot.emit('itemDrop', entity)
    // }
    //
    // const typePose = bot.supportFeature('entityMetadataHasLong') ? 19 : 18
    // const pose = packet.metadata.find(e => e.type === typePose)
    // if (pose && pose.value === 2) {
    //   bot.emit('entitySleep', entity)
    // }
    //
    // const bitField = packet.metadata.find(p => p.key === 0)
    // if (bitField === undefined) {
    //   return
    // }
    // if ((bitField.value & 2) !== 0) {
    //   entity.crouching = true
    //   bot.emit('entityCrouch', entity)
    // } else if (entity.crouching) { // prevent the initial entity_metadata packet from firing off an uncrouch event
    //   entity.crouching = false
    //   bot.emit('entityUncrouch', entity)
    // }
  })

  bot._client.on('update_attributes', (packet) => { // MAKE COMPATABLE WITH PHYSICS
    const entity = fetchEntity(packet.runtime_entity_id)
    //if (!entity.attributes) entity.attributes = {}
    entity.attributes = packet.attributes
    bot.emit('entityAttributes', entity)
  })

  bot.on('spawn', () => {
    bot.emit('entitySpawn', bot.entity)
  })

  bot._client.on('player_list', (packet) => { // REWRITE
    // player list item(s)
    // if (bot.supportFeature('playerInfoActionIsBitfield')) {
    //   for (const item of packet.records) {
    //     console.log(item)
    //     if (item.type === 'remove'){
    //
    //     }
    //     let player = bot.uuidToUsername[item.uuid] ? bot.players[bot.uuidToUsername[item.uuid]] : null
    //     let newPlayer = false
    //
    //     const obj = {
    //       uuid: item.uuid
    //     }
    //
    //     if (!player) newPlayer = true
    //
    //     player = player || obj
    //
    //     if (packet.action & 1) {
    //       obj.username = item.player.name
    //       obj.displayName = player.displayName || new ChatMessage({ text: '', extra: [{ text: item.player.name }] })
    //     }
    //
    //     if (packet.action & 4) {
    //       obj.gamemode = item.gamemode
    //     }
    //
    //     if (packet.action & 16) {
    //       obj.ping = item.latency
    //     }
    //
    //     if (item.displayName) {
    //       obj.displayName = new ChatMessage(JSON.parse(item.displayName))
    //     } else if (packet.action & 32) obj.displayName = new ChatMessage({ text: '', extra: [{ text: player.username || obj.username }] })
    //
    //     if (newPlayer) {
    //       if (!obj.username) continue // Should be unreachable
    //       player = bot.players[obj.username] = obj
    //       bot.uuidToUsername[obj.uuid] = obj.username
    //     } else {
    //       Object.assign(player, obj)
    //     }
    //
    //     const playerEntity = Object.values(bot.entities).find(e => e.type === 'player' && e.username === player.username)
    //     player.entity = playerEntity
    //
    //     if (playerEntity === bot.entity) {
    //       bot.player = player
    //     }
    //
    //     if (newPlayer) {
    //       bot.emit('playerJoined', player)
    //     } else {
    //       bot.emit('playerUpdated', player)
    //     }
    //   }
    // } else {
    packet.records.records.forEach(item => {

      let player = bot.uuidToUsername[item.uuid] ? bot.players[bot.uuidToUsername[item.uuid]] : null

      if (packet.records.type === 'add') {
        let newPlayer = false

        // New Player
        if (!player) {
          if(!item.username)
            return
          player = bot.players[item.username] = {
            username: item.username,
            uuid: item.uuid,
            displayName: new ChatMessage({ text: '', extra: [{ text: item.username }] }),
            profileKeys: item.xbox_user_id ?? null
          }

          bot.uuidToUsername[item.uuid] = item.username
          bot.emit('playerJoined', player)
          newPlayer = true
        } else {
          // Just an Update
          player = bot.players[item.username] = {
            username: item.username,
            uuid: item.uuid,
            displayName: new ChatMessage({ text: '', extra: [{ text: item.username }] }),
            profileKeys: item.xbox_user_id ?? null
          }
        }

        // if (item.username) {
        //   player.username = new ChatMessage(item.username)
        // }
        const playerEntity = Object.values(bot.entities).find(e => e.type === 'player' && e.uuid === item.uuid)
        player.entity = playerEntity
        if(player.entity)
          bot.players[item.username]['displayName'] = new ChatMessage({
            text: '',
            extra: [{ text: player.entity.nametag }]
          })


        if (playerEntity === bot.entity) {
          bot.player = player
        }

        if (!newPlayer) {
          bot.emit('playerUpdated', player)
        }
      } else if (packet.records.type === 'remove') {
        if (!player) return
        if (player.entity === bot.entity) return

        // delete entity
        if(player.entity) {
          const id = player.entity.id
          const entity = fetchEntity(id)
          bot.emit('entityGone', entity)
          entity.isValid = false
          player.entity = null
          delete bot.entities[id]
        }


        delete bot.players[player.username]
        delete bot.uuidToUsername[item.uuid]
        bot.emit('playerLeft', player)
        return
      } else {
        return
      }
      bot.emit('playerUpdated', player)
    })
  })

  function swingArm (arm = 'right', showHand = true) {
    //const hand = arm === 'right' ? 0 : 1
    const packet = {
      "action_id": "swing_arm",
      "runtime_entity_id": bot.entity.id
    }
    bot._client.write('animate', packet)
  }

  bot.swingArm = swingArm
  bot.attack = attack
  // bot.mount = mount
  // bot.dismount = dismount
  // bot.useOn = useOn
  // bot.moveVehicle = moveVehicle
  // useEntity
  function attackEntity(target){
    itemUseOnEntity(target, 0)
  }
  function itemUseOnEntity (target, type) {
    type = ['attack', 'interact'][type]
    const transaction = {
      "transaction": {
        "legacy": {
          "legacy_request_id": 0
        },
        "transaction_type": "item_use_on_entity",
        "actions": [],
        "transaction_data": {
          "entity_runtime_id": target.id,
          "action_type": type,
          "hotbar_slot": bot.selectedSlot,
          "held_item": bot.heldItem,
          "player_pos": bot.entity.position,
          "click_pos": {
            "x": 0,
            "y": 0,
            "z": 0
          }
        }
      }
    }
    bot._client.write('inventory_transaction', transaction)
  }

  function attack(target, swing = true) {
    // arm animation comes before the use_entity packet on 1.8
    if (bot.supportFeature('armAnimationBeforeUse')) {
      if (swing) {
        bot.swingArm() // in inventory
      }
      attackEntity(target)
    } else {
      attackEntity(target)
      if (swing) {
        bot.swingArm() // in inventory
      }
    }
  }

  function fetchEntity (id) {
    function searchByUUID(obj, unique_id) {
      for (const key in obj) {
        if (obj[key].unique_id === unique_id) {
          return obj[key];
        }
      }
      return null; // Если нет совпадений
    }
    if(id < 0) {
      let entity = searchByUUID(bot.entities, id)
      if(entity) {
        return entity
      }else {
        // delete bot.entities[id]
        // throw Error('UNEXPECTED!!! Couldn\'t find entity!')
        return null;
      }
    }

    return bot.entities[id] || (bot.entities[id] = new Entity(id))
  }
}

function parseMetadata (metadata, entityMetadata = {}) {
  if (metadata !== undefined) {
    for (const { key, value } of metadata) {
      entityMetadata[key] = value
    }
  }

  return entityMetadata
}
