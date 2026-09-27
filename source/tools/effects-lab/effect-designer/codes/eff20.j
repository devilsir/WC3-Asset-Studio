library eff20 initializer init
  //==================================
  //                             eff20
  //==================================
  //! externalblock extension=lua ObjectMerger $FILENAME$
  //! i setobjecttype("abilities")
  //! i if objectexists("A010") then
  //! i   modifyobject("A010")
  //! i else
  //! i   createobject("Aprg", "A010")
  //! i end
  //! i makechange(current, "anam", "eff20")
  //! i makechange(current, "alev", 1)
  //! i makechange(current, "achd", 0)
  //! i makechange(current, "aran", 1, 500.00)
  //! i makechange(current, "atar", 1, "air,ground,enemy,neutral")
  //! i makechange(current, "amcs", 1, 0)
  //! i makechange(current, "acdn", 1, 5.00)
  //! i setobjecttype("units")
  //! i if objectexists("h005") then
  //! i   modifyobject("h005")
  //! i else
  //! i   createobject("hmpr", "h005")
  //! i end
  //! i makechange(current, "uabi", "A010")
  //! i setobjecttype("abilities")
  //! i if objectexists("ACcv") then
  //! i   modifyobject("ACcv")
  //! i else
  //! i   createobject("", "ACcv")
  //! i end
  //! i makechange(current, "alig", "")
  //! i makechange(current, "asat", "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl")
  //! i setobjecttype("units")
  //! i modifyobject("ewsp")
  //! i makechange(current, "unam", "eff20dummy100")
  //! i makechange(current, "uabi", "Aloc")
  //! i makechange(current, "ufoo", 0)
  //! i makechange(current, "utyp", "_")
  //! i makechange(current, "umpm", 1000)
  //! i makechange(current, "umpi", 1000)
  //! endexternalblock
  globals
    private hashtable ht = InitHashtable()
  endglobals
  // Trigger condition
  private function Conditions takes nothing returns boolean
    return (GetSpellAbilityId()=='A010')
  endfunction
  // Unit and lightning movements in group
  private function moveproc takes unit u, unit caster, unit target, group g, timer t, integer curphase returns nothing
    local group attg = LoadGroupHandle(ht, GetHandleId(t), StringHash("attg"))
    local group gx = LoadGroupHandle(ht, GetHandleId(t), StringHash("gx"))
    local real dur = 1.00 * LoadInteger(ht, GetHandleId(t), StringHash("i"))
    local integer layer = LoadInteger(ht, GetHandleId(u), StringHash("layer"))
    local integer phase = LoadInteger(ht, GetHandleId(u), StringHash("phase"))
    local location p
    local real x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
    local real y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
    local real x
    local real r
    local real sita
    local real y
    if(phase == 0)then
      if(layer == 0)then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set r = LoadReal(ht, GetHandleId(u), StringHash("r"))
        set sita = LoadReal(ht, GetHandleId(u), StringHash("sita"))
        set x = x0 + r * CosBJ(sita)
        set y = y0 + r * SinBJ(sita)
        set sita = sita + 60
        call SetUnitPosition(u, x, y)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
        if(sita>=720)then
          call SetUnitPathing(u, true)
          call GroupRemoveUnit(g, u)
          call FlushChildHashtable(ht, GetHandleId(u))
        endif
        set x0 = x
        set y0 = y
        set layer = 1
        set x = x0
        set y = y0
        call SetUnitPosition(caster, x, y)
        call SetUnitFacing(caster, GetUnitFacing(caster) + 0.00)
        call UnitAddAbility(caster, 'Amrf')
        call UnitRemoveAbility(caster, 'Amrf')
        call SetUnitPathing(caster, false)
        call SetUnitAnimation(caster, "spell")
        set u = caster
        call SaveInteger(ht, GetHandleId(u), StringHash("ordermode"), 1)
        call SaveStr(ht, GetHandleId(u), StringHash("order"), "stop")
        set x = GetUnitX(u) + 300 * CosBJ(GetUnitFacing(caster))
        set y = GetUnitY(u) + 300 * SinBJ(GetUnitFacing(caster))
        call SaveReal(ht, GetHandleId(u), StringHash("x"), x)
        call SaveReal(ht, GetHandleId(u), StringHash("y"), y)
        call SaveReal(ht, GetHandleId(u), StringHash("timestart"), dur)
        call SaveReal(ht, GetHandleId(u), StringHash("timedelay"), 1.00)
        call GroupAddUnit(gx, u)
        call SaveInteger(ht, GetHandleId(caster), StringHash("nphase"), phase)
        call SaveInteger(ht, GetHandleId(caster), StringHash("nlayer"), layer)
        call GroupAddUnit(attg, caster)
      elseif(layer == 1)then
      elseif(layer == 2)then
      endif
    elseif(phase == 1)then
      if(layer == 0)then
      endif
    endif
    if(IsUnitDeadBJ(u))then
      call FlushChildHashtable(ht, GetHandleId(u))
    endif
    set p = null
    set gx = null
    set attg = null
  endfunction
  // Movement mainloop process
  private function Move takes timer t, integer phase, group g, unit caster, unit target returns nothing
    local unit u
    local group tmpg = CreateGroup()
    call GroupAddGroup(g, tmpg)
    loop
      set u = FirstOfGroup(tmpg)
      exitwhen u == null
      call moveproc(u, caster, target, g, t, phase)
      call GroupRemoveUnit(tmpg, u)
    endloop
    call DestroyGroup(tmpg)
    set tmpg = null
    set u = null
  endfunction
  // Timer mainloop process
  private function mainproc takes nothing returns nothing
    local integer orderabilid = 0
    local unit tmpu
    local string orderstr
    local integer ordermode
    local integer style
    local unit u = null
    local timer t = GetExpiredTimer()
    local integer i = LoadInteger(ht, GetHandleId(t), StringHash("i"))
    local group g = LoadGroupHandle(ht, GetHandleId(t), StringHash("g"))
    local group gx = LoadGroupHandle(ht, GetHandleId(t), StringHash("gx"))
    local group attg = LoadGroupHandle(ht, GetHandleId(t), StringHash("attg"))
    local group tmg = LoadGroupHandle(ht, GetHandleId(t), StringHash("tmg"))
    local unit caster = LoadUnitHandle(ht, GetHandleId(t), StringHash("caster"))
    local unit target = LoadUnitHandle(ht, GetHandleId(t), StringHash("target"))
    local real x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
    local real y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
    local integer phase = LoadInteger(ht, GetHandleId(t), StringHash("phase"))
    local real dur = i * 1.00
    local integer layer
    local location p
    local group tmpg
    local real array tmv
    local integer array tmi
    local real r
    local real sita
    local real x
    local real y
    // Layer definitions
    if(phase == 0)then
      set layer = 0
      if(dur == 1.00 )then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set r = 200
        set sita = 0
        set x = x0
        set y = y0
        call SetUnitPosition(caster, x, y)
        call SetUnitFacing(caster, GetUnitFacing(caster) + 0.00)
        call UnitAddAbility(caster, 'Amrf')
        call UnitRemoveAbility(caster, 'Amrf')
        call SetUnitPathing(caster, false)
        call SaveReal(ht, GetHandleId(caster), StringHash("r"), r)
        call SaveReal(ht, GetHandleId(caster), StringHash("sita"), sita)
        call SaveInteger(ht, GetHandleId(caster), StringHash("phase"), phase)
        call SaveInteger(ht, GetHandleId(caster), StringHash("layer"), layer)
        call GroupAddUnit(g, caster)
      endif
      set layer = 2
      if(dur <= 12.00 )then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set x = x0
        set y = y0
        call SetUnitPosition(target, x, y)
        call SetUnitFacing(target, GetUnitFacing(target) + 0.00)
        call UnitAddAbility(target, 'Amrf')
        call UnitRemoveAbility(target, 'Amrf')
        call SetUnitPathing(target, false)
        call UnitDamageTargetBJ(caster, target, 10, ATTACK_TYPE_MELEE, DAMAGE_TYPE_NORMAL)
        call PauseUnit(target, true)
        call SaveInteger(ht, GetHandleId(target), StringHash("nphase"), phase)
        call SaveInteger(ht, GetHandleId(target), StringHash("nlayer"), layer)
        call GroupAddUnit(attg, target)
      endif
      if((dur >= 12.00 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)) and IsUnitGroupEmptyBJ(g))then
        call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
        set phase = phase + 1
      endif
    elseif(phase == 1)then
      set layer = 0
      if(dur == 1.00 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1))then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set r = 0
        set sita = 0 
        loop
          exitwhen(sita > 350.00)
          set x = x0
          set y = y0
          set u = CreateUnit(GetOwningPlayer(caster), 'ewsp', x, y, sita)
          call UnitApplyTimedLife(u, 'BHwe', 2.00)
          call UnitAddAbility(u, 'Amrf')
          call UnitRemoveAbility(u, 'Amrf')
          call SetUnitPathing(u, false)
          call ShowUnitHide(u)
          call UnitAddAbility(u, 'ACcv')
          call SaveInteger(ht, GetHandleId(u), StringHash("orderabilid"), 'ACcv')
          set x = GetUnitX(u) + 200 * CosBJ(sita)
          set y = GetUnitY(u) + 200 * SinBJ(sita)
          call IssuePointOrder(u, "carrionswarm", x, y)
          call GroupAddUnit(gx, u)
          set sita = sita +  10 
        endloop
      endif
      if((dur >= 3.00 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)))then
        call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
        set phase = phase + 1
      endif
    endif
    call SaveInteger(ht, GetHandleId(t), StringHash("phase"), phase)
    set i = i + 1
    call SaveInteger(ht, GetHandleId(t), StringHash("i"), i)
    call Move(t, phase, g, caster, target)
    set tmpg = CreateGroup()
    call GroupAddGroup(gx, tmpg)
    loop
      set u = FirstOfGroup(tmpg)
      exitwhen u == null
      if(HaveSavedInteger(ht, GetHandleId(u), StringHash("ordermode")))then
        set ordermode = LoadInteger(ht, GetHandleId(u), StringHash("ordermode"))
        set orderstr = LoadStr(ht, GetHandleId(u), StringHash("order"))
        set tmv[0] = LoadReal(ht, GetHandleId(u), StringHash("timedelay"))
        set tmv[1] = LoadReal(ht, GetHandleId(u), StringHash("timestart"))
        if(dur >= tmv[0] + tmv[1])then
          if(ordermode == 0)then
            call IssueImmediateOrder(u, orderstr)
          elseif(ordermode == 1)then
            set x = LoadReal(ht, GetHandleId(u), StringHash("x"))
            set y = LoadReal(ht, GetHandleId(u), StringHash("y"))
            call IssuePointOrder(u, orderstr, x, y)
          else
            set tmpu = LoadUnitHandle(ht, GetHandleId(u), StringHash("ordertarget"))
            call IssueTargetOrder(u, orderstr, tmpu)
          endif
          call RemoveSavedInteger(ht, GetHandleId(u), StringHash("ordermode"))
          call RemoveSavedString(ht, GetHandleId(u), StringHash("order"))
          call RemoveSavedReal(ht, GetHandleId(u), StringHash("timedelay"))
          call RemoveSavedReal(ht, GetHandleId(u), StringHash("timestart"))
          call RemoveSavedReal(ht, GetHandleId(u), StringHash("x"))
          call RemoveSavedReal(ht, GetHandleId(u), StringHash("y"))
          call RemoveSavedHandle(ht, GetHandleId(u), StringHash("ordertarget"))
        endif
      endif
      call GroupRemoveUnit(tmpg, u)
    endloop
    call DestroyGroup(tmpg)
    // Final end check
    if(phase == 2)then
      call DestroyGroup(tmg)
      loop
        set u = FirstOfGroup(attg)
        exitwhen u == null
        set tmi[0] = LoadInteger(ht, GetHandleId(u), StringHash("nphase"))
        set tmi[1] = LoadInteger(ht, GetHandleId(u), StringHash("nlayer"))
        if(tmi[0] == 0) and (tmi[1] == 1)then
          call SetUnitPathing(u, true)
          call SetUnitAnimation(u, "stand")
        endif
        set tmi[0] = LoadInteger(ht, GetHandleId(u), StringHash("nphase"))
        set tmi[1] = LoadInteger(ht, GetHandleId(u), StringHash("nlayer"))
        if(tmi[0] == 0) and (tmi[1] == 2)then
          call SetUnitPathing(u, true)
          call PauseUnit(u, false)
        endif
        call FlushChildHashtable(ht, GetHandleId(u))
        call GroupRemoveUnit(attg, u)
      endloop
      call DestroyGroup(attg)
      call DestroyGroup(g)
      loop
        set u = FirstOfGroup(gx)
        exitwhen u == null
        set orderabilid = LoadInteger(ht, GetHandleId(u), StringHash("orderabilid"))
        if(orderabilid > 0)then
          call UnitRemoveAbility(u, orderabilid)
        endif
        call FlushChildHashtable(ht, GetHandleId(u))
        call GroupRemoveUnit(gx, u)
      endloop
      call DestroyGroup(gx)
      call DestroyTimer(t)
      call FlushChildHashtable(ht, GetHandleId(t))
      set tmi[0] = 0
      set tmi[1] = 2
      loop
        exitwhen (tmi[0] > tmi[1] -1)
        call FlushChildHashtable(ht, GetHandleId(t) + tmi[0])
        set tmi[0] = tmi[0] + 1
      endloop
    endif
    set tmpg = null
    set tmg = null
    set p = null
    set tmpu = null
    set t = null
    set g = null
    set u = null
  endfunction
  // Trigger actions
  private function Actions takes nothing returns nothing
    local timer t
    local group tmg = CreateGroup()
    local group g = CreateGroup()
    local group gx = CreateGroup()
    local group attg = CreateGroup()
    local unit caster = GetTriggerUnit()
    local unit target = GetSpellTargetUnit()
    local real x0 = GetUnitX(target)
    local real y0 = GetUnitY(target)
    set t = CreateTimer()
    call TimerStart(t, 1.00, true, function mainproc)
    call SaveInteger(ht, GetHandleId(t), StringHash("i"), 0)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("g"), g)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("gx"), gx)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("attg"), attg)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("tmg"), tmg)
    call SaveUnitHandle(ht, GetHandleId(t), StringHash("caster"), caster)
    call SaveReal(ht, GetHandleId(t), StringHash("x0"), x0)
    call SaveReal(ht, GetHandleId(t), StringHash("y0"), y0)
    call SaveUnitHandle(ht, GetHandleId(t), StringHash("target"), target)
    call SaveInteger(ht, GetHandleId(t), StringHash("phase"), 0)
    set t = null
    set g = null
    set gx = null
    set attg = null
    set tmg = null
    set caster = null
    set target = null
  endfunction
  // Trigger initialization
  private function init takes nothing returns nothing
    local trigger t = CreateTrigger()
    call TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_SPELL_EFFECT)
    call TriggerAddCondition(t, Condition(function Conditions))
    call TriggerAddAction(t, function Actions)
    set t = null
  endfunction
endlibrary
