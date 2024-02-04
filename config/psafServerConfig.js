export const fixturesChannels = [
  { name: 'GBL',
    value: '1090959034963742781',
    emoji: ':___GBL:1091064891034566676',
    pingRole: '1154064939263213648',
    standingsMsg: '1185321840047038514'
  },{
    name: 'MSL',
    value: '1112413187489411072',
    emoji: ':___MSL:1109239585701101588',
    pingRole: '1154065063360069763',
    standingsMsg: '1185321632194105494'
  },{
    name:'ENCEL',
    value: '1090959133668294666',
    emoji: ':___ENCEL:1091064847212494989',
    pingRole: '1154065149888561162',
    standingsMsg: '1185322055089000500'
  },{
    name:'WEL',
    value: '1177013563974500513',
    emoji: ':__PSAF:1095732362400247838',
    pingRole: '1177014748856991755',
    standingsMsg: '1185330583514132550',
    players: 8
  },{
    name: 'Challengers League (Group A)',
    value: '1101999929171394653-a',
    emoji: ':___ChallengersLeague:1199341222444158986',
    channel: '1101999929171394653'
  },{
    name: 'Challengers League (Group B)',
    value: '1101999929171394653-b',
    emoji: ':___ChallengersLeague:1199341222444158986',
    channel: '1101999929171394653'
  },{
    name: 'Challengers League (Group C)',
    value: '1101999929171394653-c',
    emoji: ':___ChallengersLeague:1199341222444158986',
    channel: '1101999929171394653'
  },{
    name: 'Challengers League (Group D)',
    value: '1101999929171394653-d',
    emoji: ':___ChallengersLeague:1199341222444158986',
    channel: '1101999929171394653'
  },{
    name: 'Challengers League',
    value: '1101999929171394653-k',
    emoji: ':___ChallengersLeague:1199341222444158986',
    channel: '1101999929171394653'
  },{
    name: 'Masters League (Group A)',
    value: '1101999952483328140-a',
    emoji: ':___MastersLeague:1199341225472425984',
    channel: '1101999952483328140'
  },{
    name: 'Masters League (Group B)',
    value: '1101999952483328140-b',
    emoji: ':___MastersLeague:1199341225472425984',
    channel: '1101999952483328140'
  },{
    name: 'Masters League (Group C)',
    value: '1101999952483328140-c',
    emoji: ':___MastersLeague:1199341225472425984',
    channel: '1101999952483328140'
  },{
    name: 'Masters League (Group D)',
    value: '1101999952483328140-d',
    emoji: ':___MastersLeague:1199341225472425984',
    channel: '1101999952483328140'
  },{
    name: 'Masters League',
    value: '1101999952483328140-k',
    emoji: ':___MastersLeague:1199341225472425984',
    channel: '1101999952483328140'
  },{
    name: 'Redemption League (Group A)',
    value: '1202650816197034025-a',
    emoji: ':___RedemptionLeague:1201545169393168514',
    channel: '1202650816197034025'
  },{
    name: 'Redemption League (Group B)',
    value: '1202650816197034025-b',
    emoji: ':___RedemptionLeague:1201545169393168514',
    channel: '1202650816197034025'
  },{
    name: 'Redemption League (Group C)',
    value: '1202650816197034025-c',
    emoji: ':___RedemptionLeague:1201545169393168514',
    channel: '1202650816197034025'
  },{
    name: 'Redemption League (Group D)',
    value: '1202650816197034025-d',
    emoji: ':___RedemptionLeague:1201545169393168514',
    channel: '1202650816197034025'
  },{
    name: 'Redemption League',
    value: '1202650816197034025-k',
    emoji: ':___RedemptionLeague:1201545169393168514',
    channel: '1202650816197034025'
  },{
    name: 'Nations League',
    value: '1162009301402001418',
    emoji: ':NationsLeague:1167121018905690233',
    channel: '1162009301402001418'
  },{
    name: 'International Friendly',
    value: '1156513002552573953',
    emoji: ':full_star:1128309835369291827'
  },{
    name: 'Club Friendly',
    value: '1156513002552573953',
    emoji: ':__PSAF:1095732362400247838'
  },{
    name: 'TEST',
    value: '1150376229178978377',
    emoji: ':full_star:1128309835369291827'
  }
]

export const matchDays = [
  {
    name: 'Day 1'
  },{
    name: 'Day 2'
  },{
    name: 'Day 3'
  },{
    name: 'Day 4'
  },{
    name: 'Day 5'
  },{
    name: 'Day 6'
  },{
    name: 'Day 7'
  },{
    name: 'Day 8'
  },{
    name: 'Day 9'
  },{
    name: 'Day 10'
  },{
    name: 'Day 11'
  },{
    name: 'Day 12'
  },{
    name: 'Day 13'
  },{
    name: 'Day 14'
  },{
    name: 'Day 15'
  },{
    name: 'Day 16'
  },{
    name: 'Day 17'
  },{
    name: 'Day 18'
  },{
    name: 'Qualifiers'
  },{
    name: 'Quarter-Finals'
  },{
    name: 'Semi-Finals'
  },{
    name: '3rd Place'
  },{
    name: 'Final'
  },{
    name: 'Day 19'
  },{
    name: 'Day 20'
  },{
    name: 'Day 21'
  },{
    name: 'Day 22'
  },{
    name: 'Day 23'
  }
].map(({name})=> ({name, value:name}))

export const currentSeason = 3

export const serverRoles = {
  clubManagerRole: '1072620773434462318',
  matchBlacklistRole: '1095055617703543025',
  nationalTeamPlayerRole: '1103327647955685536',
  adminRole: '1081886764366573658',
  presidentRole: '1072201212356726836',
  clubPlayerRole: '1072620805600592062',
  psafManagementRole: '1072210995927339139',
  trialStaffRole: '1093846550226149437',
  verifiedRole: '1184943462261469325',
}

export const serverChannels = {
  confirmationTransferChannel: '1125540835589623938',
  dealsChannelId: '1092712923845120010',
  confirmationChannelId: '1074061044361732157',
  botTestingChannelId: '1150376229178978377',
  clubsChannelId: '1072206607196360764',
  scheduleChannelId: '1136790176488755303',
  dailyResultsChannelId: '1174360872886489118',
  lobbiesChannelId: '1081887877274812487',
  standingsChannelId: '1185321370977050775',
  ratingsChannelId: '1120629390699667542',
  moveMatchChannelId: '1091692461409173544',
  nameChangesChannelId: '1198359043153068092',
  matchResultsChannelId: '1081954664347615352'
}