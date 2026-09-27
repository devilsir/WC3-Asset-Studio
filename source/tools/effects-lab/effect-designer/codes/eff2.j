//============== Abil1 ==============
function Trig_Abil1_Condition takes nothing returns boolean
  return (GetUnitAbilityLevel(GetAttacker(), 'A0gh')>0) and (GetRandomReal(1,100)<0.00) and IsUnitType(GetAttacker(), UNIT_TYPE_HERO)
endfunction
function Trig_Abil1_Actions takes nothing returns nothing
  local unit caster=GetTriggerUnit()
  local unit u
  local unit dummy
  local real x0
  local real y0
  local real sita
  local integer i
  set x0=GetUnitX(caster)
  set y0=GetUnitY(caster)
  set i=0
  loop
    exitwhen i>2
    set dummy=CreateUnit(GetOwningPlayer(caster), 'ewsp', x0, y0, 0)
    call UnitApplyTimedLife(dummy, 'BHwe', 1.00)
    call ShowUnitHide(dummy)
    call UnitAddAbility(dummy,'Amrf')
    call UnitRemoveAbility(dummy,'Amrf')
    call SetUnitFlyHeight(dummy, 55.00, 0)
    call UnitAddAbility(dummy, 'A034')
    call SetUnitAbilityLevel(dummy, 'A034', GetUnitAbilityLevel(caster, 'A0gh'))
    call IssuePointOrderById(dummy, 852119, x0, y0)
    set i=i+1
  endloop
  set caster=null
  set dummy=null
  set u=null
endfunction
function InitTrig_Abil1 takes nothing returns nothing
  local trigger t=CreateTrigger()
  call TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_ATTACKED)
  call TriggerAddCondition(t, Condition(function Trig_Abil1_Condition))
  call TriggerAddAction(t, function Trig_Abil1_Actions)
  set t=null
endfunction
