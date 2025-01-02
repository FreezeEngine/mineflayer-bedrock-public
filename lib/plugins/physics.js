const { Vec3 } = require('vec3')
const assert = require('assert')
const math = require('../math')
const conv = require('../conversions')
const { performance } = require('perf_hooks')
const { createDoneTask, createTask } = require('../promise_utils')

const { Physics, PlayerState } = require('prismarine-physics')

module.exports = inject

const PI = Math.PI
const PI_2 = Math.PI * 2
const PHYSICS_INTERVAL_MS = 50
const PHYSICS_TIMESTEP = PHYSICS_INTERVAL_MS / 1000

function inject (bot, { physicsEnabled }) {
  // console.log(bot.blockAt(pos, false));
  const world = { getBlock: (pos) => {
    // if(bot.entity.position.y < 0) {
      //console.log(bot.blockAt(new Vec3(128, 68+63, 128), false));
    //}//console.log(bot.blockAt(new Vec3(0, -61, 0).offset(0, +64, 0), false))
    return bot.blockAt(pos, false)
  } }
  const physics = Physics(bot.registry, world)

  const positionUpdateSentEveryTick = bot.supportFeature('positionUpdateSentEveryTick')

  bot.jumpQueued = false
  bot.jumpTicks = 0 // autojump cooldown

  const controlState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    sneak: false
  }
  let lastSentJumping = false
  let lastSentSprinting = false
  let lastSentSneaking = false
  let lastSentYaw = null
  let lastSentPitch = null
  let lastSentHeadYaw = null

  let doPhysicsTimer = null
  let lastPhysicsFrameTime = null
  let shouldUsePhysics = false
  bot.physicsEnabled = physicsEnabled ?? true

  let tick = 0n

  const lastSent = {
    pitch: 0,
    yaw: 0, // change
    position: new Vec3(0,0,0), // change
    move_vector: { x:0, z:0 }, // change
    head_yaw: 0, // change
    input_data: {
      ascend: false,
      descend: false,
      north_jump: false,
      jump_down: false,
      sprint_down: false,
      change_height: false,
      jumping: false,
      auto_jumping_in_water: false,
      sneaking: false,
      sneak_down: false,
      up: false,
      down: false,
      left: false,
      right: false,
      up_left: false,
      up_right: false,
      want_up: false,
      want_down: false,
      want_down_slow: false,
      want_up_slow: false,
      sprinting: false,
      ascend_block: false,
      descend_block: false,
      sneak_toggle_down: false,
      persist_sneak: false,
      start_sprinting: false,
      stop_sprinting: false,
      start_sneaking: false,
      stop_sneaking: false,
      start_swimming: false,
      stop_swimming: false,
      start_jumping: false,
      start_gliding: false,
      stop_gliding: false,
      item_interact: false,
      block_action: false,
      item_stack_request: false
    },
    input_mode: 'mouse',
    play_mode: 'screen',
    interact_rotation: {x:0, z:0},
    //gaze_direction: undefined,
    tick: tick,
    delta: new Vec3(0,0,0), // velocity change
    //transaction: undefined,
    //item_stack_request: undefined,
    //block_action: undefined,
    analogue_move_vector: { x:0, z:0 }, // for versions (1.19.80) > 1.19.30
    camera_orientation: {x:0, y:0, z:0},
    raw_move_vector: {x: 0, z:0}
  }

  // This function should be executed each tick (every 0.05 seconds)
  // How it works: https://gafferongames.com/post/fix_your_timestep/
  let timeAccumulator = 0
  let subchunkContainingPlayer = null

  function getChunkCoordinates(pos) {
    let chunkX = Math.floor(pos.x / 16);
    let chunkZ = Math.floor(pos.z / 16);
    let subchunkY = Math.floor(pos.y / 16);
    return new Vec3(chunkX, subchunkY, chunkZ);
  }

  function doPhysics () {
  //console.log('PHYSICS ENGINE IS UP')
    const now = performance.now()
    const deltaSeconds = (now - lastPhysicsFrameTime) / 1000
    lastPhysicsFrameTime = now

    timeAccumulator += deltaSeconds

    while (timeAccumulator >= PHYSICS_TIMESTEP) {
      if (bot.physicsEnabled && shouldUsePhysics) {
        physics.simulatePlayer(new PlayerState(bot, controlState), world).apply(bot)
        let subchunkContainingPlayerNew = getChunkCoordinates(bot.entity.position)
        if(subchunkContainingPlayerNew!==subchunkContainingPlayer){
          subchunkContainingPlayer = subchunkContainingPlayerNew
          bot.emit('subchunkContainingPlayerChanged', subchunkContainingPlayerNew)
        }
        bot.emit('physicsTick')
        bot.emit('physicTick') // Deprecated, only exists to support old plugins. May be removed in the future
      }
      updatePosition(PHYSICS_TIMESTEP)
      timeAccumulator -= PHYSICS_TIMESTEP
    }
  }

  function cleanup () {
    clearInterval(doPhysicsTimer)
    doPhysicsTimer = null
  }
  function updateMovement(){
    let moveVector = lastSent.move_vector
    if(controlState.forward)
    {
      moveVector.z = 1;
    }
    else if(controlState.back)
    {
      moveVector.z = -1;
    }
    else if(!controlState.forward && !controlState.back)
    {
      moveVector.z = 0;
    }

    if(controlState.right)
    {
      moveVector.x = -1;
    }
    else if(controlState.left)
    {
      moveVector.x = 1;
    }
    else if(!controlState.left && !controlState.right)
    {
      moveVector.x = 0;
    }
    if(controlState.right && controlState.forward ||
      controlState.left && controlState.forward||
      controlState.left && controlState.back||
      controlState.right && controlState.back){
      let value = 0.7071067690849304
      moveVector.x = controlState.left ? value : value * -1
      moveVector.z = controlState.forward ? value : value * -1
    }
    //console.log([moveVector,controlState])
    lastSent.input_data.up = controlState.forward
    lastSent.input_data.down = controlState.back
    lastSent.input_data.right = controlState.right
    lastSent.input_data.left = controlState.left
    // lastSent.input_data.up_right = moveVector.z === 1 && moveVector.x === -1
    // lastSent.input_data.up_left = moveVector.z === 1 && moveVector.x === 1

    if(lastSent.input_data.start_jumping === controlState.jump){
      lastSent.input_data.start_jumping = false
    }
    if(controlState.jump!==lastSentJumping){
      lastSentJumping = controlState.jump
      lastSent.input_data.jumping = controlState.jump
      lastSent.input_data.want_up = controlState.jump
      lastSent.input_data.north_jump = controlState.jump
      lastSent.input_data.jump_down = controlState.jump
      lastSent.input_data.start_jumping = controlState.jump
    }
    if(controlState.sprint!==lastSentSprinting){
      lastSentSprinting = controlState.sprint
      lastSent.input_data.sprint_down = controlState.sprint
      lastSent.input_data.sprinting = controlState.sprint
      lastSent.input_data.stop_sprinting = !controlState.sprint
    }
    if(controlState.sneak!==lastSentSneaking){
      lastSentSneaking = controlState.sneak
      lastSent.input_data.sneak_down = controlState.sneak
      lastSent.input_data.sneaking = controlState.sneak
      lastSent.input_data.stop_sneaking = !controlState.sneak
    }
  }

  // function sendPacketPosition (position) {
  //   // sends data, no logic
  //   const oldPos = new Vec3(lastSent.position.x, lastSent.position.y, lastSent.position.z)
  //   lastSent.delta  = new Vec3(
  //     position.x - lastSent.position.x,
  //     position.y - lastSent.position.y,
  //     position.z - lastSent.position.z
  //   );
  //   lastSent.position = position
  //
  //   updateMovement()
  //
  //   lastSent.position.y += 1.62001037597656 // BEDROCK OFFSET
  //   // lastSent.onGround = onGround
  //   bot._client.write('player_auth_input', lastSent)
  //   lastSent.position.y -= 1.62001037597656 // BEDROCK OFFSET
  //   bot.emit('move', oldPos)
  // }

  // function sendPacketLook (yaw, pitch, headYaw) {
  //   // sends data, no logic
  //   const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)
  //   lastSent.yaw = yaw
  //   lastSent.pitch = pitch
  //   lastSent.head_yaw = headYaw
  //   lastSent.position.y += 1.62001037597656 // BEDROCK OFFSET
  //   bot._client.write('player_auth_input', lastSent)
  //   lastSent.position.y -= 1.62001037597656 // BEDROCK OFFSET
  //   bot.emit('move', oldPos)
  // }

  function sendPacketPositionAndLook (position, yaw, pitch) {

    lastSent.tick = lastSent.tick + BigInt(1)

    // sends data, no logic
    const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)
    lastSent.delta  = new Vec3(
      position.x - lastSent.position.x,
      position.y - lastSent.position.y,
      position.z - lastSent.position.z
    );
    // lastSent.delta  = new Vec3(
    //   bot.entity.velocity.x - lastSent.delta.x,
    //   bot.entity.velocity.y - lastSent.delta.y,
    //   bot.entity.velocity.z - lastSent.delta.z
    // );
    if(!(lastSent.delta.x === 0 && lastSent.delta.y === 0 && lastSent.delta.z === 0)) {
      //console.log('UPDATE' + position)
    }
    lastSent.position = position

    //console.log(lastSent.position)
    //console.log(position)
    lastSent.yaw = yaw
    lastSent.pitch = pitch
    lastSent.head_yaw = yaw

    updateMovement()

    lastSent.position.y += 1.62001037597656 // BEDROCK OFFSET
    // lastSent.onGround = onGround
    bot._client.write('player_auth_input', lastSent)
    lastSent.position.y -= 1.62001037597656// BEDROCK OFFSET
    bot.emit('move', oldPos)
  }

  function deltaYaw (yaw1, yaw2) {
    let dYaw = (yaw1 - yaw2) % PI_2
    if (dYaw < -PI) dYaw += PI_2
    else if (dYaw > PI) dYaw -= PI_2

    return dYaw
  }

  function updatePosition (dt) {
    // bot.isAlive = true // TODO: MOVE TO HEALTH
    // If you're dead, you're probably on the ground though ...
    if (!bot.isAlive) bot.entity.onGround = true

    // Increment the yaw in baby steps so that notchian clients (not the server) can keep up.
    const dYaw = deltaYaw(bot.entity.yaw, lastSentYaw)
    const dPitch = bot.entity.pitch - (lastSentPitch || 0)

    // Vanilla doesn't clamp yaw, so we don't want to do it either
    const maxDeltaYaw = dt * physics.yawSpeed
    const maxDeltaPitch = dt * physics.pitchSpeed

    lastSentYaw += math.clamp(-maxDeltaYaw, dYaw, maxDeltaYaw)
    lastSentPitch += math.clamp(-maxDeltaPitch, dPitch, maxDeltaPitch)

    const yaw = Math.fround(conv.toNotchianYaw(lastSentYaw))
    const pitch = Math.fround(conv.toNotchianPitch(lastSentPitch))
    const position = bot.entity.position

    const onGround = bot.entity.onGround

    // Only send a position update if necessary, select the appropriate packet
    const positionUpdated = lastSent.x !== position.x || lastSent.y !== position.y || lastSent.z !== position.z
    // bot.isAlive = true // GET IT TO THE BOT
    const lookUpdated = lastSent.yaw !== yaw || lastSent.pitch !== pitch

    if (positionUpdated && lookUpdated && bot.isAlive) {
      sendPacketPositionAndLook(position, yaw, pitch)
    } else if (positionUpdated && bot.isAlive) {
      sendPacketPositionAndLook(position, yaw, pitch)
      //sendPacketPosition(position, onGround)
    } else if (lookUpdated && bot.isAlive) {
      sendPacketPositionAndLook(position, yaw, pitch)
      //sendPacketLook(yaw, pitch, headYaw, onGround)
    } else if (performance.now() - lastSent.time >= 1000) {
      // Send a position packet every second, even if no update was made
      //sendPacketPosition(position, onGround)
      sendPacketPositionAndLook(position, yaw, pitch)
      lastSent.time = performance.now()
    } else if (positionUpdateSentEveryTick && bot.isAlive) {
      // For versions < 1.12, one player packet should be sent every tick
      // for the server to update health correctly
      // bot._client.write('flying', { onGround: bot.entity.onGround })
    }
  }

  bot.physics = physics

  bot.setControlState = (control, state) => {
    assert.ok(control in controlState, `invalid control: ${control}`)
    assert.ok(typeof state === 'boolean', `invalid state: ${state}`)
    if (controlState[control] === state) return
    controlState[control] = state
    if (control === 'jump' && state) {
      bot.jumpQueued = true
    } else if (control === 'sprint') {
      bot._client.write('set_entity_data',{
        runtime_entity_id: bot.entity.id,
        metadata:[
          {
            "key": "flags",
            "type": "long",
            "value":{
              "sprinting": state,
            }
          }
        ],
        tick: 0
      })
    } else if (control === 'sneak') {
      bot._client.write('set_entity_data',{
        runtime_entity_id: bot.entity.id,
        metadata:[
          {
            "key": "flags",
            "type": "long",
            "value":{
              "sneaking": state,
            }
          }
        ],
        tick: 0
      })
    }
  }

  bot.getControlState = (control) => {
    assert.ok(control in controlState, `invalid control: ${control}`)
    return controlState[control]
  }

  bot.clearControlStates = () => {
    for (const control in controlState) {
      bot.setControlState(control, false)
    }
  }

  bot.controlState = {}

  for (const control of Object.keys(controlState)) {
    Object.defineProperty(bot.controlState, control, {
      get () {
        return controlState[control]
      },
      set (state) {
        bot.setControlState(control, state)
        return state
      }
    })
  }

  let lookingTask = createDoneTask()

  bot.on('move', () => {
    if (!lookingTask.done && Math.abs(deltaYaw(bot.entity.yaw, lastSentYaw)) < 0.001) {
      lookingTask.finish()
    }
  })

  // bot._client.on('explosion', explosion => {
  //   // TODO: emit an explosion event with more info
  //   if (bot.physicsEnabled && bot.game.gameMode !== 'creative') {
  //     bot.entity.velocity.x += explosion.playerMotionX
  //     bot.entity.velocity.y += explosion.playerMotionY
  //     bot.entity.velocity.z += explosion.playerMotionZ
  //   }
  // })

  bot.look = async (yaw, pitch, headYaw, force) => {
    if (!lookingTask.done) {
      lookingTask.finish() // finish the previous one
    }
    lookingTask = createTask()

    if(!bot.entity.headYaw){ // needs aa fix?
      bot.entity.headYaw = 0;
    }

    // this is done to bypass certain anticheat checks that detect the player's sensitivity
    // by calculating the gcd of how much they move the mouse each tick
    const sensitivity = conv.fromNotchianPitch(0.15) // this is equal to 100% sensitivity in vanilla
    const yawChange = Math.round((yaw - bot.entity.yaw) / sensitivity) * sensitivity

    const headYawChange = Math.round((headYaw - bot.entity.headYaw) / sensitivity) * sensitivity
    const pitchChange = Math.round((pitch - bot.entity.pitch) / sensitivity) * sensitivity

    if (yawChange === 0 && pitchChange === 0) {
      return
    }

    bot.entity.yaw += yawChange
    bot.entity.headYaw += headYawChange
    bot.entity.pitch += pitchChange

    if (force) {
      lastSentYaw = yaw
      lastSentPitch = pitch
      return
    }

    await lookingTask.promise
  }

  bot.lookAt = async (point, force) => {
    const delta = point.minus(bot.entity.position.offset(0, bot.entity.height, 0))
    const yaw = Math.atan2(-delta.x, -delta.z)
    const headYaw = Math.atan2(-delta.x, -delta.z)
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
    const pitch = Math.atan2(delta.y, groundDistance)
    await bot.look(yaw, pitch, headYaw, force)
  }

  // player position and look (clientbound) server to client
  const setPosition = (packet) => {
    if(BigInt(packet.runtime_id ?? packet.runtime_entity_id) !== bot.entity.id)
      return
    console.log('BOT MOVED')
    bot.entity.height = 1.62
    bot.entity.velocity.set(0, 0, 0)

    // If flag is set, then the corresponding value is relative, else it is absolute
    const pos = bot.entity.position
    const position = packet.player_position ?? packet.position
    const start_game_packet = !!packet.player_position
    pos.set(
        position.x,
        position.y,
        position.z
    )

    const newYaw = packet.yaw ?? packet.rotation.z
    const newPitch = packet.pitch ?? packet.rotation.x
    bot.entity.yaw = newYaw // conv.fromNotchianYaw(newYaw)
    bot.entity.pitch = newPitch // conv.fromNotchianPitch(newPitch)
    bot.entity.onGround = false

    sendPacketPositionAndLook(pos, newYaw, newPitch, bot.entity.onGround)

    shouldUsePhysics = true
    bot.entity.timeSinceOnGround = 0
    lastSentYaw = bot.entity.yaw
    if (start_game_packet)
      bot._client.once('spawn',async (packet)=>{
        shouldUsePhysics = true
        if (doPhysicsTimer === null) {
          await bot.waitForChunksToLoad()
          lastPhysicsFrameTime = performance.now()
          doPhysicsTimer = setInterval(doPhysics, PHYSICS_INTERVAL_MS)
        }
      })
    bot.emit('forcedMove')
  }

  bot._client.on('move_player', setPosition)
  bot._client.on('start_game', setPosition)
  

  let runtimeEntityId; // Declare a variable to store the runtime_entity_id

  bot._client.on('start_game', (packet) => {
    runtimeEntityId = packet.runtime_entity_id; // Save the runtime_entity_id
    console.log(`Runtime Entity ID saved: ${runtimeEntityId}`);
  });



bot._client.on('start_game', (packet) => { // Listen for chat messages from the server and echo them back.
  bot._client.queue('serverbound_loading_screen', {
    "type": 1
  })
  bot._client.queue('serverbound_loading_screen', {
    "type": 2
  })
  bot._client.queue('interact', {
    "action_id": "mouse_over_entity",
    "target_entity_id": 0n,
    "position": {
      "x": 0,
      "y": 0,
      "z": 0
    }
  })
  bot._client.queue('set_local_player_as_initialized', {
    "runtime_entity_id": `${runtimeEntityId}`
  })
})

  bot.waitForTicks = async function (ticks) {
    if (ticks <= 0) return
    await new Promise(resolve => {
      const tickListener = () => {
        ticks--
        if (ticks === 0) {
          bot.removeListener('physicsTick', tickListener)
          resolve()
        }
      }
      bot.on('physicsTick', tickListener)
    })
  }

  //bot.on('mount', () => { shouldUsePhysics = false })
  // bot.on('respawn', () => { shouldUsePhysics = false })
  bot.on('end', cleanup)
}
