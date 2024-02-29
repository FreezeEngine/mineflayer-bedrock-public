module.exports = inject

function inject (bot, { hideErrors }) {

  //0-8, null = uninitialized
  // which quick bar slot is selected
  bot.quickBarSlot = null
  // TODO: make it load into slots properly
  bot.inventory = {
    slots:[]
  }
  bot.heldItem =  { // null?
    network_id: 0
  }

  bot.selectedSlot = null
  bot.usingHeldItem = false

  bot._client.on('inventory_content', (packet)=>{
    if(!bot.inventory)
      bot.inventory = {
        slots:[]
      }
    bot.inventory[packet.window_id] = packet.input
  })

  bot._client.on('inventory_slot', (packet)=>{
    if(!bot.inventory)
      bot.inventory = {
        slots:[]
      }
    bot.inventory[packet.window_id] = []
    bot.inventory[packet.window_id][packet.slot] = packet.item
    if(bot.inventory && bot.selectedSlot) {
      bot.heldItem = bot.inventory.inventory[bot.selectedSlot]
    }
  })

  bot._client.on('player_hotbar', (packet)=>{
    if (packet.select_slot){
      bot.selectedSlot = packet.selected_slot
      if(bot.inventory.inventory) {
        bot.heldItem = bot.inventory[packet.window_id][packet.selected_slot]
      }
    }
  })

  function useItem (slotNumber) {
    bot.usingHeldItem = true
    bot._client.write('inventory_transaction', {
      "transaction": {
        "legacy": {
          "legacy_request_id": 0
        },
        "transaction_type": "item_use",
        "actions": [],
        "transaction_data": {
          "action_type": "click_air",
          "block_position": {"x": 0, "y": 0, "z": 0},
          "face": bot.entity.yaw, // facing?
          "hotbar_slot": slotNumber+1,
          "held_item": bot.inventory.inventory[slotNumber-1],
          "player_pos": bot.entity.position,
          "click_pos": {"x": 0, "y": 0, "z": 0},
          "block_runtime_id": 0
        }
      }
    })
  }
  function swingArm (arm = 'right', showHand = true) {
    //const hand = arm === 'right' ? 0 : 1
    const packet = {
      "action_id": "swing_arm",
      "runtime_entity_id": bot.entity.runtime_entity_id
    }
    bot._client.write('animate', packet)
  }

  bot.swingArm = swingArm
  bot.useItem = useItem
}
