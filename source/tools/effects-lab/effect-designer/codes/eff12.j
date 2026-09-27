//==================================
//                             eff12
//==================================
//! external FileImporter D:\models\BTNIcon1.blp war3mapimported\BTNIcon1.blp
//! external FileImporter D:\models\dummy1.mdx war3mapimported\dummy1.mdx
//! external FileImporter D:\models\dummy1_Portrait.mdx war3mapimported\dummy1_Portrait.mdx
//! externalblock extension=lua ObjectMerger $FILENAME$
//! i setobjecttype("abilities")
//! i createobject("Aprg","A001")
//! i makechange(current,"unam","eff12")
//! i makechange(current,"aart","war3mapimported\BTNIcon1.blp")
//! i makechange(current,"alev","1")
//! i makechange(current,"aran","500.00")
//! i makechange(current,"atar","air,ground,enemy,neutral")
//! i makechange(current,"amcs","100")
//! i makechange(current,"acdn","5.00")
//! i makechange(current,"achd","0")
//! i makechange(current,"ahky","C")
//! i setobjecttype("items")
//! i createobject("ssil","I001")
//! i makechange(current,"iabi","A001")
//! i setobjecttype("units")
//! i createobject("ewsp","u001")
//! i makechange(current, "unam", "eff12dummy000")
//! i makechange(current,"uabi","Aloc")
//! i makechange(current,"umdl","war3mapimported\dummy1.mdx")
//! endexternalblock
function Trig_eff12_Conditions takes nothing returns boolean
  return (GetSpellAbilityId()=='A001')
endfunction
function GroupGetCount_eff12 takes hashtable ht, integer entry, string groupname returns integer
  local integer i = 0
  loop
    exitwhen not HaveSavedHandle(ht, entry, StringHash(groupname) + i)
    set i = i + 1
  endloop
  return i
endfunction
function IsHandlegroupEmpty_eff12 takes hashtable ht, integer entry, string groupname returns boolean
  return (GroupGetCount_eff12(ht, entry, groupname) == 0)
endfunction
function LightninggroupAddLightning_eff12 takes hashtable ht, integer entry, string groupname, lightning whichlightning, boolean add returns nothing
  local integer num=GroupGetCount_eff12(ht, entry, groupname)
  local integer i=0
  local integer index=0
  if(add)then
    if(num==0)then
      call SaveLightningHandle(ht, entry, StringHash(groupname)+num, whichlightning)
    else
      set i=0
      loop
        exitwhen (i>num-1) or (whichlightning==LoadLightningHandle(ht, entry, StringHash(groupname)+i))
        set i=i+1
      endloop
      if(i==num)then
        call SaveLightningHandle(ht, entry, StringHash(groupname)+num, whichlightning)
      endif
    endif
  else
    if(num>0)then
      set i=0
      loop
        exitwhen (i>num-1) or (whichlightning==LoadLightningHandle(ht, entry, StringHash(groupname)+i))
        set i=i+1
      endloop
      set index = i
      if(index < num)then
        call RemoveSavedHandle(ht, entry, StringHash(groupname)+i)
        set i=index+1
        loop
          exitwhen (i>num-1)
          call SaveLightningHandle(ht, entry, StringHash(groupname)+i-1, LoadLightningHandle(ht, entry, StringHash(groupname)+i))
          call RemoveSavedHandle(ht, entry, StringHash(groupname)+i)
          set i=i+1
        endloop
      endif
    endif
  endif
endfunction
function LightninggroupDeleteLightning_eff12 takes hashtable ht, integer entry, string groupname, integer index returns nothing
  local integer num=GroupGetCount_eff12(ht, entry, groupname)
  local integer i=0
  if(num > 0)then
    if(index < num)then
      call RemoveSavedHandle(ht, entry, StringHash(groupname)+index)
      set i=index+1
      loop
        exitwhen (i>num-1)
        call SaveLightningHandle(ht, entry, StringHash(groupname)+i-1, LoadLightningHandle(ht, entry, StringHash(groupname)+i))
        call RemoveSavedHandle(ht, entry, StringHash(groupname)+i)
        set i=i+1
      endloop
    endif
  endif
endfunction
function moveproc_eff12 takes unit u, unit caster, group g, timer t, integer curphase returns nothing
  local integer layer = LoadInteger(ht, GetHandleId(u), StringHash("layer_eff12"))
  local integer phase = LoadInteger(ht, GetHandleId(u), StringHash("phase_eff12"))
  local location p
  local real x0 = GetUnitX(caster)
  local real y0 = GetUnitY(caster)
  local real x
  local real r
  local real sita
  local real y
  if(phase == 0)then
    if(layer == 0)then
      set r = LoadReal(ht, GetHandleId(u), StringHash("r_eff12"))
      set sita = LoadReal(ht, GetHandleId(u), StringHash("sita_eff12"))
      set x = x0 + r * CosBJ(sita)
      set y = y0 + r * SinBJ(sita)
      set r = r + 3
      call SetUnitPosition(u, x, y)
      call SaveReal(ht, GetHandleId(u), StringHash("r_eff12"), r)
      if(r>=500)then
        call KillUnit(u)
        call FlushChildHashtable(ht, GetHandleId(u))
        call GroupRemoveUnit(g, u)
      endif
    endif
  endif
  if(IsUnitDeadBJ(u))then
    call FlushChildHashtable(ht, GetHandleId(u))
  endif
  set p = null
endfunction
function Move_eff12 takes timer t, integer phase, group g, unit caster returns nothing
  local lightning l
  local real z
  local real dur = 0.10 * LoadInteger(ht, GetHandleId(t), StringHash("i"))
  local unit u
  local group tmpg = CreateGroup()
  local integer layer
  local real x
  local real r
  local real sita
  local real y
  if(phase == 0)then
    set layer = 0
    set r = LoadReal(ht, GetHandleId(t) + phase, StringHash("r") + layer)
    set sita = LoadReal(ht, GetHandleId(t) + phase, StringHash("sita") + layer)
    set x = x0 + r * CosBJ(sita)
    set y = y0 + r * SinBJ(sita)
    set r = r + 3
    set z = 0
    set l = AddLightningEx("CLPB", true, x0,  y0,  z,  x,  y, z)
    call SaveReal(ht, GetHandleId(l), StringHash("lifestart"), dur)
    call SaveReal(ht, GetHandleId(l), StringHash("lifespan"), 0.30)
    call LightninggroupAddLightning_eff12(ht, GetHandleId(t), "lg", l, true)
    call SaveReal(ht, phase + GetHandleId(t), layer + StringHash("r"), r)
    if(r>=500)then
      call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
      set phase = phase + 1
      call SaveInteger(ht, GetHandleId(t), StringHash("phase"), phase)
    endif
  endif
  call GroupAddGroup(g, tmpg)
  loop
    set u = FirstOfGroup(tmpg)
    exitwhen u == null
    call moveproc_eff12(u, caster, g, t, phase)
    call GroupRemoveUnit(tmpg, u)
  endloop
  call DestroyGroup(tmpg)
  set l = null
  set tmpg = null
  set u = null
endfunction
function mainproc_eff12 takes nothing returns nothing
  local lightning l
  local integer style
  local unit u = null
  local timer t = GetExpiredTimer()
  local integer i = LoadInteger(ht, GetHandleId(t), StringHash("i"))
  local group g = LoadGroupHandle(ht, GetHandleId(t), StringHash("g"))
  local group tmg = LoadGroupHandle(ht, GetHandleId(t), StringHash("tmg"))
  local unit caster = LoadUnitHandle(ht, GetHandleId(t), StringHash("caster"))
  local real x0 = GetUnitX(caster)
  local real y0 = GetUnitY(caster)
  local integer phase = LoadInteger(ht, GetHandleId(t), StringHash("phase"))
  local real dur = i * 0.10
  local integer layer
  local location p
  local group tmpg
  local real array tmv
  local integer array tmi
  local real r
  local real sita
  local real x
  local real y
  if(phase == 0)then
    set layer = 0
    if(dur <= 2.10 )then
      set x0 = GetUnitX(caster)
      set y0 = GetUnitY(caster)
      set r = 100
      set sita = 0 
      loop
        exitwhen(sita  > 350.00)
        set x = x0 + r * CosBJ(sita)
        set y = y0 + r * SinBJ(sita)
        set u = CreateUnit(GetOwningPlayer(caster), 'u001', x, y, GetUnitFacing(caster) + 0.00)
        call UnitApplyTimedLife(u, 'BHwe', 1.00)
        call SetUnitPathing(u, false)
        call SaveReal(ht, GetHandleId(u), StringHash("r_eff12"), r)
        call SaveReal(ht, GetHandleId(u), StringHash("sita_eff12"), sita)
        call SaveInteger(ht, GetHandleId(u), StringHash("phase_eff12"), phase)
        call SaveInteger(ht, GetHandleId(u), StringHash("layer_eff12"), layer)
        call GroupAddUnit(g, u)
        set sita = sita + 10 
      endloop
      if(dur == 0.00 )then
        call SaveReal(ht, phase + GetHandleId(t), layer + StringHash("r"), r)
        call SaveReal(ht, phase + GetHandleId(t), layer + StringHash("sita"), sita)
      endif
    endif
    if((dur >= 2.10 + LoadReal(ht, GetHandleId(t), StringHash("endtime") + phase - 1)))then
      call SaveReal(ht, GetHandleId(t), StringHash("endtime") + phase, dur)
      set phase = phase + 1
    endif
  endif
  call SaveInteger(ht, GetHandleId(t), StringHash("phase"), phase)
  set i = i + 1
  call SaveInteger(ht, GetHandleId(t), StringHash("i"), i)
  call Move_eff12(t, phase, g, caster)
  set tmi[0] = GroupGetCount_eff12(ht, GetHandleId(t), "lg")
  set tmi[1] = 0
  loop
    exitwhen(tmi[1]>tmi[0] - 1)
    set l = LoadLightningHandle(ht, GetHandleId(t), StringHash("lg") + tmi[1])
    if(HaveSavedReal(ht, GetHandleId(l), StringHash("lifestart")) and HaveSavedReal(ht, GetHandleId(l), StringHash("lifespan")))then
      set tmv[0] = LoadReal(ht, GetHandleId(l), StringHash("lifespan"))
      set tmv[1] = LoadReal(ht, GetHandleId(l), StringHash("lifestart"))
      if (dur >= tmv[0] + tmv[1])then
        call DestroyLightning(l)
        call FlushChildHashtable(ht, GetHandleId(l))
        call LightninggroupDeleteLightning_eff12(ht, GetHandleId(t), "lg", tmi[1])
      endif
    endif
    set tmi[1] = tmi[1] + 1
  endloop
  if(phase == 1)then
    call DestroyGroup(tmg)
    loop
      set u = FirstOfGroup(g)
      exitwhen u == null
      call FlushChildHashtable(ht, GetHandleId(u))
      call GroupRemoveUnit(g, u)
    endloop
    call DestroyGroup(g)
    call DestroyTimer(t)
    call FlushChildHashtable(ht, GetHandleId(t))
  endif
  set tmpg = null
  set tmg = null
  set p = null
  set l = null
  set t = null
  set g = null
  set u = null
endfunction
function Initialize_eff12 takes nothing returns nothing
  local timer t
  local group tmg = CreateGroup()
  local group g = CreateGroup()
  local unit caster = GetTriggerUnit()
  set t = CreateTimer()
  call TimerStart(t, 0.10, true, function mainproc_eff12)
  call SaveInteger(ht, GetHandleId(t), StringHash("i"), 0)
  call SaveGroupHandle(ht, GetHandleId(t), StringHash("g"), g)
  call SaveGroupHandle(ht, GetHandleId(t), StringHash("tmg"), tmg)
  call SaveUnitHandle(ht, GetHandleId(t), StringHash("caster"), caster)
  call SaveInteger(ht, GetHandleId(t), StringHash("phase"), 0)
  set t = null
  set g = null
  set tmg = null
  set caster = null
endfunction
function InitTrig_eff12 takes nothing returns nothing
  local trigger t = CreateTrigger()
  call TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_SPELL_EFFECT)
  call TriggerAddCondition(t, Condition(function Trig_eff12_Conditions))
  call TriggerAddAction(t, function Initialize_eff12)
  set t = null
endfunction
