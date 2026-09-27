library eff1 initializer init
  //==================================
  //                             eff1
  //==================================
  //! external FileImporter D:\\models\\BTNIcon1.blp war3mapimported\\BTNIcon1.blp
  //! externalblock extension=lua ObjectMerger $FILENAME$
  //! i setobjecttype("abilities")
  //! i createobject("Adis", "A001")
  //! i makechange(current, "anam", "eff1")
  //! i makechange(current, "aart", "war3mapimported\\BTNIcon1.blp")
  //! i makechange(current, "alev", 1)
  //! i makechange(current, "ahky", "C")
  //! i makechange(current, "achd", 0)
  //! i makechange(current, "aran", 1, 500.00)
  //! i makechange(current, "atar", 1, "air,ground,enemy,neutral")
  //! i makechange(current, "amcs", 1, 0)
  //! i makechange(current, "acdn", 1, 2.00)
  //! i makechange(current, "atp1", 1, "技能名字(|cffffcc00C|r)")
  //! i makechange(current, "aub1", 1, "这是技能说明。")
  //! i setobjecttype("units")
  //! i createobject("hmpr", "h005")
  //! i makechange(current, "uabi", "A001")
  //! i setobjecttype("units")
  //! endexternalblock
  globals
    private hashtable ht = InitHashtable()
  endglobals
  // Functions conditions
  private function FunctionCondition0 takes nothing returns boolean
    return (GetUnitAbilityLevel(GetTriggerUnit(), 'A002')>0)
  endfunction
  // Functions actions
  private function FunctionActions0 takes nothing returns nothing
    local real array tmv
    local group g = null
    local unit u = null
    local unit caster = GetTriggerUnit()
    set g = CreateGroup()
    call GroupEnumUnitsInRange(g, GetUnitX(caster), GetUnitY(caster), 300, null)
    loop
      set u = FirstOfGroup(g)
      exitwhen u == null
      if(IsUnitEnemy(u, GetOwningPlayer(caster)))then
        set tmv[0] = GetUnitState(caster, UNIT_STATE_LIFE)
        call SaveReal(ht, GetHandleId(u), StringHash("life"), tmv[0])
        call SetUnitState(caster, UNIT_STATE_LIFE, tmv[0]+100)
      endif
      call GroupRemoveUnit(g, u)
    endloop
    call DestroyGroup(g)
    set u = null
    set g = null
  endfunction
  // Trigger initialization
  private function init takes nothing returns nothing
    local trigger t
    set t = CreateTrigger()
    call TriggerRegisterAnyUnitEventBJ(t, EVENT_PLAYER_UNIT_DEATH)
    call TriggerAddCondition(t, Condition(function FunctionCondition0))
    call TriggerAddAction(t, function FunctionActions0)
    set t = null
  endfunction
endlibrary
