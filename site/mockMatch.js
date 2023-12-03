import { ObjectId } from "mongodb";
export const mockMatch = {
  match: {
    _id: new ObjectId("655bbbd293df6296af0aa652"),
    home: '1079111791822503936',
    away: '1076205993433759837',
    dateTimestamp: '1700850607',
    league: '1090959034963742781',
    matchday: 'Day 2',
    homeScore: '2',
    awayScore: '9',
    isInternational: null,
    season: 4,
    logId: '1176251765054767206',
    messageId: '1177352167716302900',
    refs: '500554372623892490',
    password: 'nbaj',
    finished: true,
    isFF: null
  },
  league: {
    name: 'GBL',
    value: '1090959034963742781',
    emoji: ':___GBL:1091064891034566676',
    pingRole: '1154064939263213648'
  },
  homeTeam: {
    _id: new ObjectId("64f384205c53d823389c31f1"),
    id: '1079111791822503936',
    name: 'Ball Wonder FC',
    description: 'none',
    permissions: '0',
    position: 77,
    color: 276590,
    hoist: false,
    managed: false,
    mentionable: false,
    icon: 'd917eca54a34df58986138612c6d7c1d',
    unicode_emoji: null,
    flags: 0,
    active: true,
    shortName: 'BWFC',
    displayName: '',
    budget: 180500000,
    city: 'Bolton',
    emoji: '<:BallWonderFC:1145008459662758011>',
    flag: '🏴<U+E0067><U+E0062><U+E0065><U+E006E><U+E0067><U+E007F>',
    logo: 'https://cdn.discordapp.com/attachments/1157617150001942539/1157621403781169252/BWFC_Logo_Full_v1.png',
    logoMsg: '1164306470704259162',
    teamMsg: '1164306475523518484'
  },
awayTeam: {
    _id: new ObjectId("64f384205c53d823389c31e4"),
    id: '1076205993433759837',
    name: 'Polg FC',
    description: 'none',
    permissions: '0',
    position: 78,
    color: 10076908,
    hoist: false,
    managed: false,
    mentionable: false,
    icon: '821c914ea8711f11ca22d0de60ebe01c',
    unicode_emoji: null,
    flags: 0,
    active: true,
    shortName: 'POLG',
    displayName: '',
    budget: 148000000,
    city: 'Truro',
    emoji: '<:PolgFC:1076201337118793769>',
    flag: '🏴<U+E0067><U+E0062><U+E0065><U+E006E><U+E0067><U+E007F>',
    logo: 'https://cdn.discordapp.com/attachments/1157617150001942539/1157621539974418463/POLG.png',
    logoMsg: '1164306466681925663',
    teamMsg: '1164306469471125585'
  },
  allNationalTeams: [
    {
      _id: new ObjectId("6506124c46520c8763ab3902"),
      name: 'Turkiye',
      flag: '🇹🇷',
      messageId: '1156522843832590346'
    },
{
      _id: new ObjectId("65062645ab438189dc08768b"),
      name: 'Spain',
      flag: '🇪🇦',
      messageId: '1156522895741288458'
    },
    {
      _id: new ObjectId("65062645ab438189dc087695"),
      name: 'Italy',
      flag: '🇮🇹',
      messageId: '1156522904343806002'
    },
    {
      _id: new ObjectId("65062645ab438189dc0876a2"),
      name: 'Germany',
      flag: '🇩🇪',
      messageId: '1156522914556936232'
    },
    {
      _id: new ObjectId("65062645ab438189dc0876af"),
      name: 'Romania',
      flag: '🇷🇴',
      messageId: '1156522924828803115'
    },
    {
      _id: new ObjectId("65062645ab438189dc0876be"),
      name: 'Saudi Arabia',
      flag: '🇸🇦',
      messageId: null
    },
    {
      _id: new ObjectId("65062645ab438189dc0876d1"),
      name: 'Sweden',
      flag: '🇸🇪',
      messageId: '1156522941392101430'
    },
    {
      _id: new ObjectId("65062645ab438189dc0876d7"),
      name: 'England',
      flag: '🏴<U+E0067><U+E0062><U+E0065><U+E006E><U+E0067><U+E007F>',
      messageId: '1156522950158192650'
    },
  {
     _id: new ObjectId("65062646ab438189dc087800"),
     name: 'Latvia',
     flag: '🇱🇻'
   },
   {
     _id: new ObjectId("65062646ab438189dc087816"),
     name: 'Moldova',
     flag: '🇲🇩'
   },
   {
     _id: new ObjectId("65062646ab438189dc08781d"),
     name: 'Nigeria',
     flag: '🇳🇬'
   },
   {
     _id: new ObjectId("65062646ab438189dc08781f"),
     name: 'Switzerland',
     flag: '🇨🇭'
   },
   {
     _id: new ObjectId("65062646ab438189dc087821"),
     name: 'Pakistan',
     flag: '🇵🇰'
   },
   {
     _id: new ObjectId("65062646ab438189dc087829"),
     name: 'Northern Ireland',
     flag: '🇬🇧'
   },
   {
     _id: new ObjectId("65062646ab438189dc087826"),
     name: 'Somalia',
     flag: '🇸🇴'
   },
   {
     _id: new ObjectId("65062646ab438189dc08783d"),
     name: 'Belarus',
     flag: '🇧🇾'
   },
   {
     _id: new ObjectId("65062646ab438189dc08784b"),
     name: 'UnitedArab Emirates',
     flag: '🇦🇪'
   },
   {
     _id: new ObjectId("65062646ab438189dc087858"),
     name: 'Tunisia',
     flag: '🇹🇳'
   }
 ],
homeLineup: {
    cm: { id: '316286370937176066', name: 'BWFC | .castlě [86]' },
    gk: { id: '263447331888824320', name: '⭐ BWFC | Ice [88]' },
    lb: { id: '548500879930818589', name: '⭐ BWFC | H0gch' },
    lw: { id: '677203527021494312', name: '⭐ BWFC | Wolffe' },
    rb: { id: '90747930985652224', name: '⭐ BWFC | Nym [79]' },
    rw: { id: '269565950154506243', name: '⭐ BWFC | ShinSH [81]' },
    sub1: { id: '373789198341111820', name: '⭐ BWFC | Eyzord [78]' },
    sub2: { id: '808339784673394728', name: 'SHFC | Invest' },
    sub3: { id: '350194755159851008', name: '⭐ BWFC | Yionel [81]' },
    sub4: { id: '227641668973625344', name: '⭐ BWFC | Element' },
    sub5: { id: null, name: 'NO NAME' }
  },
  awayLineup: {
    cm: { id: '185835765559853056', name: '⭐ POLG | yosh4 [85]' },
    gk: { id: '620294779481358370', name: 'POLG | WillThePenguin [82]' },
    lb: { id: '712818143042732032', name: '⭐ POLG | Chilled' },
    lw: { id: '349200206111440897', name: '⭐ POLG | Madimir Putin [87]' },
    rb: { id: '128161695800623104', name: '⭐ POLG | job [82]' },
    rw: { id: '424497174106079263', name: 'POLG | Laycon' },
    sub1: { id: '342405190462341134', name: '⭐ POLG | GoatlaseHD' },
    sub2: { id: '368115588783931393', name: 'POLG | GaZ' },
    sub3: { id: '696719161614926005', name: 'POLG | Ice_Spirit' },
    sub4: { id: null, name: 'NO NAME' },
    sub5: { id: null, name: 'NO NAME' }
  }
}