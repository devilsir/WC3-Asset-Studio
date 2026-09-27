library eff11 initializer init
  //==================================
  //                             eff11
  //==================================
  //! external FileImporter D:\models\magic2.blp war3mapimported\magic2.blp
  //! external FileImporter D:\models\kamui.mdx war3mapimported\kamui.mdx
  //! external FileImporter D:\models\freezingring.mdx war3mapimported\freezingring.mdx
  //! externalblock extension=lua ObjectMerger $FILENAME$
  //! i setobjecttype("abilities")
  //! i if objectexists("A001") then
  //! i   modifyobject("A001")
  //! i else
  //! i   createobject("ACde", "A001")
  //! i end
  //! i makechange(current, "anam", "eff11")
  //! i makechange(current, "aart", "war3mapimported\\magic2.blp")
  //! i makechange(current, "alev", 1)
  //! i makechange(current, "ahky", "C")
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
  //! i makechange(current, "uabi", "A001")
  //! i setobjecttype("units")
  //! i if objectexists("u001") then
  //! i   modifyobject("u001")
  //! i else
  //! i   createobject("ewsp", "u001")
  //! i end
  //! i makechange(current, "unam", "eff11dummy000")
  //! i makechange(current, "uabi", "Aloc")
  //! i makechange(current, "ufoo", 0)
  //! i makechange(current, "utyp", "_")
  //! i makechange(current, "umdl", "war3mapimported\\kamui.mdx")
  //! i setobjecttype("units")
  //! i if objectexists("u002") then
  //! i   modifyobject("u002")
  //! i else
  //! i   createobject("ewsp", "u002")
  //! i end
  //! i makechange(current, "unam", "eff11dummy100")
  //! i makechange(current, "uabi", "Aloc")
  //! i makechange(current, "ufoo", 0)
  //! i makechange(current, "utyp", "_")
  //! i makechange(current, "umdl", "Abilities\\Weapons\\AvengerMissile\\AvengerMissile.mdl")
  //! i setobjecttype("units")
  //! i if objectexists("u003") then
  //! i   modifyobject("u003")
  //! i else
  //! i   createobject("ewsp", "u003")
  //! i end
  //! i makechange(current, "unam", "eff11dummy110")
  //! i makechange(current, "uabi", "Aloc")
  //! i makechange(current, "ufoo", 0)
  //! i makechange(current, "utyp", "_")
  //! i makechange(current, "umdl", "Abilities\\Weapons\\ZigguratMissile\\ZigguratMissile.mdl")
  //! i setobjecttype("units")
  //! i if objectexists("u002") then
  //! i   modifyobject("u002")
  //! i else
  //! i   createobject("ewsp", "u002")
  //! i end
  //! i makechange(current, "unam", "eff11dummy120")
  //! i makechange(current, "uabi", "Aloc")
  //! i makechange(current, "ufoo", 0)
  //! i makechange(current, "utyp", "_")
  //! endexternalblock
  globals
    private hashtable ht = InitHashtable()
  endglobals
  // Trigger condition
  private function Conditions takes nothing returns boolean
    return (GetSpellAbilityId()=='A001')
  endfunction
  // Unit and lightning movements in group
  private function moveproc takes unit u, unit caster, real x0, real y0, group g, timer t, integer curphase returns nothing
    local integer layer = LoadInteger(ht, GetHandleId(u), StringHash("layer"))
    local integer phase = LoadInteger(ht, GetHandleId(u), StringHash("phase"))
    local location p
    local real s
    local real r
    local real para
    local real z
    local real x
    local real sita
    local real y
    local real w
    if(phase == 0)then
      if(layer == 0)then
        set s = LoadReal(ht, GetHandleId(u), StringHash("s"))
        set s = s + 0.06
        call SetUnitScale(u, s,s,s)
        call SaveReal(ht, GetHandleId(u), StringHash("s"), s)
        if(curphase > phase)then
          call GroupRemoveUnit(g, u)
          call FlushChildHashtable(ht, GetHandleId(u))
        endif
      endif
    elseif(phase == 1)then
      if(layer == 0)then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para = LoadReal(ht, GetHandleId(u), StringHash("para"))
        set z = LoadReal(ht, GetHandleId(u), StringHash("z"))
        set w = LoadReal(ht, GetHandleId(u), StringHash("w"))
        set sita = LoadReal(ht, GetHandleId(u), StringHash("sita"))
        set r = Pow(200*para*(z+100), 0.5)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set z=z + 60
        set sita = sita + w*0.1
        call SetUnitPosition(u, x, y)
        call SetUnitFlyHeight(u, z, RAbsBJ(z - GetUnitFlyHeight(u)) / 0.10)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
      elseif(layer == 1)then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para = LoadReal(ht, GetHandleId(u), StringHash("para"))
        set z = LoadReal(ht, GetHandleId(u), StringHash("z"))
        set w = LoadReal(ht, GetHandleId(u), StringHash("w"))
        set sita = LoadReal(ht, GetHandleId(u), StringHash("sita"))
        set r = Pow(200*para*(z+100), 0.5)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set z=z + 60
        set sita = sita + w*0.1
        call SetUnitPosition(u, x, y)
        call SetUnitFlyHeight(u, z, RAbsBJ(z - GetUnitFlyHeight(u)) / 0.10)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
      elseif(layer == 2)then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para = LoadReal(ht, GetHandleId(u), StringHash("para"))
        set z = LoadReal(ht, GetHandleId(u), StringHash("z"))
        set w = LoadReal(ht, GetHandleId(u), StringHash("w"))
        set sita = LoadReal(ht, GetHandleId(u), StringHash("sita"))
        set r = Pow(200*para*(z+100), 0.5)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set z=z + 60
        set sita = sita + w*0.1
        call SetUnitPosition(u, x, y)
        call SetUnitFlyHeight(u, z, RAbsBJ(z - GetUnitFlyHeight(u)) / 0.10)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
      elseif(layer == 3)then
      endif
    endif
    if(IsUnitDeadBJ(u))then
      call FlushChildHashtable(ht, GetHandleId(u))
    endif
    set p = null
  endfunction
  // Movement mainloop process
  private function Move takes timer t, integer phase, group g, unit caster, real x0, real y0 returns nothing
    local unit u
    local group tmpg = CreateGroup()
    call GroupAddGroup(g, tmpg)
    loop
      set u = FirstOfGroup(tmpg)
      exitwhen u == null
      call moveproc(u, caster, x0, y0, g, t, phase)
      call GroupRemoveUnit(tmpg, u)
    endloop
    call DestroyGroup(tmpg)
    set tmpg = null
    set u = null
  endfunction
  // Timer mainloop process
  private function mainproc takes nothing returns nothing
    local effect efc
    local integer style
    local unit u = null
    local timer t = GetExpiredTimer()
    local integer i = LoadInteger(ht, GetHandleId(t), StringHash("i"))
    local group g = LoadGroupHandle(ht, GetHandleId(t), StringHash("g"))
    local group tmg = LoadGroupHandle(ht, GetHandleId(t), StringHash("tmg"))
    local unit caster = LoadUnitHandle(ht, GetHandleId(t), StringHash("caster"))
    local real x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
    local real y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
    local integer phase = LoadInteger(ht, GetHandleId(t), StringHash("phase"))
    local real dur = i * 0.10
    local integer layer
    local location p
    local group tmpg
    local real array tmv
    local integer array tmi
    local real s
    local real para
    local real z
    local real r
    local real w
    local real sita
    local real x
    local real y
    // Layer definitions
    if(phase == 0)then
      set layer = 0
      if(dur == 0.10 )then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set s = 0.1
        set x = x0
        set y = y0
        set u = CreateUnit(GetOwningPlayer(caster), 'u001', x, y, GetUnitFacing(caster) + 0.00)
        call UnitApplyTimedLife(u, 'BHwe', 8.00)
        call UnitAddAbility(u, 'Amrf')
        call UnitRemoveAbility(u, 'Amrf')
        call SetUnitPathing(u, false)
        call SetUnitScale(u, 0.1, 0.1, 0.1)
        call SaveReal(ht, GetHandleId(u), StringHash("s"), s)
        call SaveInteger(ht, GetHandleId(u), StringHash("phase"), phase)
        call SaveInteger(ht, GetHandleId(u), StringHash("layer"), layer)
        call GroupAddUnit(g, u)
      endif
      if((dur >= 2.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)))then
        call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
        set phase = phase + 1
      endif
    elseif(phase == 1)then
      set layer = 0
      if(dur <= 8.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1))then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para=Pow(4, 3)/8
        set z = 0
        set r = Pow(200*para*(z+100), 0.5)
        set w = 90 * RSignBJ(GetRandomReal(-1,1))
        set sita = GetRandomReal(0, 360)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set u = CreateUnit(GetOwningPlayer(caster), 'u002', x, y, GetUnitFacing(caster) + 0.00)
        call SetUnitFlyHeight(u, z, 0)
        call UnitApplyTimedLife(u, 'BHwe', 1.00)
        call UnitAddAbility(u, 'Amrf')
        call UnitRemoveAbility(u, 'Amrf')
        call SetUnitPathing(u, false)
        call SaveReal(ht, GetHandleId(u), StringHash("para"), para)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("w"), w)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
        call SaveInteger(ht, GetHandleId(u), StringHash("phase"), phase)
        call SaveInteger(ht, GetHandleId(u), StringHash("layer"), layer)
        call GroupAddUnit(g, u)
      endif
      set layer = 1
      if(dur <= 8.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1))then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para=Pow(3, 3)/8
        set z = 0
        set r = Pow(200*para*(z+100), 0.5)
        set w = 90 * RSignBJ(GetRandomReal(-1,1))
        set sita = GetRandomReal(0, 360)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set u = CreateUnit(GetOwningPlayer(caster), 'u003', x, y, GetUnitFacing(caster) + 0.00)
        call SetUnitFlyHeight(u, z, 0)
        call UnitApplyTimedLife(u, 'BHwe', 1.00)
        call UnitAddAbility(u, 'Amrf')
        call UnitRemoveAbility(u, 'Amrf')
        call SetUnitPathing(u, false)
        call SetUnitScale(u, 0.5, 0.5, 0.5)
        call SaveReal(ht, GetHandleId(u), StringHash("para"), para)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("w"), w)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
        call SaveInteger(ht, GetHandleId(u), StringHash("phase"), phase)
        call SaveInteger(ht, GetHandleId(u), StringHash("layer"), layer)
        call GroupAddUnit(g, u)
      endif
      set layer = 2
      if(dur <= 8.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1))then
        set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
        set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
        set para=Pow(2, 3)/8
        set z = 0
        set r = Pow(200*para*(z+100), 0.5)
        set w = 90 * RSignBJ(GetRandomReal(-1,1))
        set sita = GetRandomReal(0, 360)
        set x=x0 + r * CosBJ(sita)
        set y=y0 + r * SinBJ(sita)
        set u = CreateUnit(GetOwningPlayer(caster), 'u002', x, y, GetUnitFacing(caster) + 0.00)
        call SetUnitFlyHeight(u, z, 0)
        call UnitApplyTimedLife(u, 'BHwe', 1.00)
        call UnitAddAbility(u, 'Amrf')
        call UnitRemoveAbility(u, 'Amrf')
        call SetUnitPathing(u, false)
        call SaveReal(ht, GetHandleId(u), StringHash("para"), para)
        call SaveReal(ht, GetHandleId(u), StringHash("z"), z)
        call SaveReal(ht, GetHandleId(u), StringHash("w"), w)
        call SaveReal(ht, GetHandleId(u), StringHash("sita"), sita)
        call SaveInteger(ht, GetHandleId(u), StringHash("phase"), phase)
        call SaveInteger(ht, GetHandleId(u), StringHash("layer"), layer)
        call GroupAddUnit(g, u)
      endif
      set layer = 3
      if(dur <= 8.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1))then
        if(ModuloInteger(i, 2) == 0)then
          set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
          set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
          set x = x0
          set y = y0
          set tmpg = CreateGroup()
          call GroupEnumUnitsInRange(tmpg, x, y, 500.00, null)
          loop
            set u = FirstOfGroup(tmpg)
            exitwhen (u == null)
            if (IsUnitEnemy(u, GetOwningPlayer(caster)))then
              call UnitAddAbility(u, 'Amrf')
              call UnitRemoveAbility(u, 'Amrf')
              call SetUnitPathing(u, false)
              call UnitDamageTargetBJ(caster, u, 20, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_ENHANCED)
            endif
            call GroupRemoveUnit(tmpg, u)
          endloop
          call DestroyGroup(tmpg)
          set efc = AddSpecialEffect("war3mapimported\\freezingring.mdx", x, y)
          call DestroyEffect(efc)
        endif
      endif
      if((dur >= 8.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)) and IsUnitGroupEmptyBJ(g))then
        call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
        set phase = phase + 1
      endif
    endif
    call SaveInteger(ht, GetHandleId(t), StringHash("phase"), phase)
    set i = i + 1
    call SaveInteger(ht, GetHandleId(t), StringHash("i"), i)
    set x0 = LoadReal(ht, GetHandleId(t), StringHash("x0"))
    set y0 = LoadReal(ht, GetHandleId(t), StringHash("y0"))
    call Move(t, phase, g, caster, x0, y0)
    // Final end check
    if(phase == 2)then
      call DestroyGroup(tmg)
      call DestroyGroup(g)
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
    set efc = null
    set t = null
    set g = null
    set u = null
  endfunction
  // Trigger actions
  private function Actions takes nothing returns nothing
    local timer t
    local group tmg = CreateGroup()
    local group g = CreateGroup()
    local unit caster = GetTriggerUnit()
    local real x0 = GetSpellTargetX()
    local real y0 = GetSpellTargetY()
    set t = CreateTimer()
    call TimerStart(t, 0.10, true, function mainproc)
    call SaveInteger(ht, GetHandleId(t), StringHash("i"), 0)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("g"), g)
    call SaveGroupHandle(ht, GetHandleId(t), StringHash("tmg"), tmg)
    call SaveUnitHandle(ht, GetHandleId(t), StringHash("caster"), caster)
    call SaveReal(ht, GetHandleId(t), StringHash("x0"), x0)
    call SaveReal(ht, GetHandleId(t), StringHash("y0"), y0)
    call SaveInteger(ht, GetHandleId(t), StringHash("phase"), 0)
    set t = null
    set g = null
    set tmg = null
    set caster = null
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
