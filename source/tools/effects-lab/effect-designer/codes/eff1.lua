--==================================
--                             eff1
--==================================
//! external FileImporter D:\\models\\BTNIcon1.blp war3mapimported\\BTNIcon1.blp
//! externalblock extension=lua ObjectMerger $FILENAME$
//! i setobjecttype("abilities")
//! i createobject("Aprg", "A001")
//! i makechange(current, "anam", "eff1")
//! i makechange(current, "aart", "war3mapimported\\BTNIcon1.blp")
//! i makechange(current, "alev", 1)
//! i makechange(current, "ahky", "C")
//! i makechange(current, "achd", 0)
//! i makechange(current, "aran", 1, 500.00)
//! i makechange(current, "atar", 1, "air,ground,enemy,neutral")
//! i makechange(current, "amcs", 1, 0)
//! i makechange(current, "acdn", 1, 2.00)
//! i setobjecttype("units")
//! i createobject("hmpr", "h005")
//! i makechange(current, "uabi", "A001")
//! i setobjecttype("units")
//! endexternalblock
-- Trigger condition
function Conditions_eff1 (  )
  return (GetSpellAbilityId()==FourCC('A001'))
end
-- Unit and lightning movements in group
function moveproc_eff1 (  u,  caster,  target,  g,  t,  curphase )
  local  layer = LoadInteger(ht, GetHandleId(u), StringHash("layer_eff1"))
  local  phase = LoadInteger(ht, GetHandleId(u), StringHash("phase_eff1"))
  local  p
  local  x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
  local  y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
  local  x
  local  r
  local  sita
  local  y
  local  z
  if(phase == 0)then
    if(layer == 0)then
      x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
      y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
      r = LoadReal(ht, GetHandleId(u), StringHash("r_eff1"))
      sita = LoadReal(ht, GetHandleId(u), StringHash("sita_eff1"))
      x = x0 + r * CosBJ(sita)
      y = y0 + r * SinBJ(sita)
      z = (-0.004) * Pow(r, 2) + 2 * r
      r = r + 25
      SetUnitPosition(u, x, y)
      SetUnitFlyHeight(u, z, RAbsBJ(z - GetUnitFlyHeight(u)) / 0.10)
      SaveReal(ht, GetHandleId(u), StringHash("r_eff1"), r)
      if(r>=500)then
        SetUnitPathing(u, true)
        FlushChildHashtable(ht, GetHandleId(u))
        GroupRemoveUnit(g, u)
      end
    end
  end
  if(IsUnitDeadBJ(u))then
    FlushChildHashtable(ht, GetHandleId(u))
  end
  p = nil
end
-- Movement mainloop process
function Move_eff1 (  t,  phase,  g,  caster,  target )
  local  u
  local  tmpg = CreateGroup()
  GroupAddGroup(g, tmpg)
  while (true) do
    u = FirstOfGroup(tmpg)
    if (u == nil) then
      break
    end
    moveproc_eff1(u, caster, target, g, t, phase)
    GroupRemoveUnit(tmpg, u)
  end
  DestroyGroup(tmpg)
  tmpg = nil
  u = nil
end
-- Timer mainloop process
function mainproc_eff1 (  )
  local  style
  local  u = nil
  local  t = GetExpiredTimer()
  local  i = LoadInteger(ht, GetHandleId(t), StringHash("i"))
  local  g = LoadGroupHandle(ht, GetHandleId(t), StringHash("g"))
  local  tmg = LoadGroupHandle(ht, GetHandleId(t), StringHash("tmg"))
  local  caster = LoadUnitHandle(ht, GetHandleId(t), StringHash("caster"))
  local  target = LoadUnitHandle(ht, GetHandleId(t), StringHash("target"))
  local  x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
  local  y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
  local  phase = LoadInteger(ht, GetHandleId(t), StringHash("phase"))
  local  dur = i * 0.10
  local  layer
  local  p
  local  tmpg
  local  tmv = {}
  local  tmi = {}
  local  r
  local  sita
  local  x
  local  y
  -- Layer definitions
  if(phase == 0)then
    layer = 0
    if(dur <= 2.10 )then
      x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
      y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
      r = 0
      sita = GetUnitFacing(caster)
      x = x0
      y = y0
      tmpg = CreateGroup()
      GroupEnumUnitsInRange(tmpg, x, y, 300.00, nil)
      while (true) do
        u = FirstOfGroup(tmpg)
        if (u == nil) then
          break
        end
        if (IsUnitEnemy(u, GetOwningPlayer(caster)) )then
          UnitAddAbility(u, FourCC('Amrf'))
          UnitRemoveAbility(u, FourCC('Amrf'))
          SetUnitPathing(u, false)
          SaveReal(ht, GetHandleId(u), StringHash("r_eff1"), r)
          SaveReal(ht, GetHandleId(u), StringHash("sita_eff1"), sita)
          SaveInteger(ht, GetHandleId(u), StringHash("phase_eff1"), phase)
          SaveInteger(ht, GetHandleId(u), StringHash("layer_eff1"), layer)
          GroupAddUnit(g, u)
        end
        GroupRemoveUnit(tmpg, u)
      end
      DestroyGroup(tmpg)
    end
    if((dur >= 2.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)) and IsUnitGroupEmptyBJ(g))then
      SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
      phase = phase + 1
    end
  end
  SaveInteger(ht, GetHandleId(t), StringHash("phase"), phase)
  i = i + 1
  SaveInteger(ht, GetHandleId(t), StringHash("i"), i)
  Move_eff1(t, phase, g, caster, target)
  -- Final end check
  if(phase == 1)then
    DestroyGroup(tmg)
    while (true) do
      u = FirstOfGroup(g)
      if (u == nil) then
        break
      end
      FlushChildHashtable(ht, GetHandleId(u))
      GroupRemoveUnit(g, u)
    end
    DestroyGroup(g)
    DestroyTimer(t)
    FlushChildHashtable(ht, GetHandleId(t))
  end
  tmpg = nil
  tmg = nil
  p = nil
  t = nil
  g = nil
  u = nil
end
-- Trigger actions
function Actions_eff1 (  )
  local  t
  local  tmg = CreateGroup()
  local  g = CreateGroup()
  local  caster = GetTriggerUnit()
  local  target = GetSpellTargetUnit()
  local  x0 = GetUnitX(target)
  local  y0 = GetUnitY(target)
  t = CreateTimer()
  TimerStart(t, 0.10, true, function mainproc_eff1)
  SaveInteger(ht, GetHandleId(t), StringHash("i"), 0)
  SaveGroupHandle(ht, GetHandleId(t), StringHash("g"), g)
  SaveGroupHandle(ht, GetHandleId(t), StringHash("tmg"), tmg)
  SaveUnitHandle(ht, GetHandleId(t), StringHash("caster"), caster)
  SaveReal(ht, GetHandleId(t), StringHash("x0"), x0)
  SaveReal(ht, GetHandleId(t), StringHash("y0"), y0)
  SaveUnitHandle(ht, GetHandleId(t), StringHash("target"), target)
  SaveInteger(ht, GetHandleId(t), StringHash("phase"), 0)
  t = nil
  g = nil
  tmg = nil
  caster = nil
  target = nil
end
-- Trigger initialization
function init_eff1 (  )
  local  t = CreateTrigger()
  TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_SPELL_EFFECT)
  TriggerAddCondition(t, Condition(function Conditions_eff1))
  TriggerAddAction(t, function Actions_eff1)
  t = nil
end
