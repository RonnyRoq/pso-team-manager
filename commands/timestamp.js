import { InteractionResponseType } from "discord-interactions";
import { optionToTimezoneStr, msToTimestamp, optionsToObject } from "../functions/helpers.js"
import { DiscordRequest } from "../utils.js"
import * as chrono from 'chrono-node';

export const timestamp = ({interaction_id, token, options}) => {
  const {date, timezone = 0} = optionsToObject(options)
  const parsedDate = parseDate(date, timezone)
  const doubleParse = msToTimestamp(Date.parse(parsedDate))
  return DiscordRequest(`/interactions/${interaction_id}/${token}/callback`, {
    method: 'POST',
    body: {
      type : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `<t:${doubleParse}:F> < t:${doubleParse}:F >`,
        flags: 1 << 6
      }
    }
  })
}

export const parseDate = (date, timezone) => {
  const strTimezone = optionToTimezoneStr(timezone)
  return chrono.parseDate(date, { instance: new Date(), timezone: strTimezone }, {
    timezones: { 
      "UK": {
        timezoneOffsetDuringDst: 60,
        timezoneOffsetNonDst: 0,
        dstStart: (year) => chrono.getLastWeekdayOfMonth(year, chrono.Month.MARCH, chrono.Weekday.SUNDAY, 2),
        dstEnd: (year) => chrono.getLastWeekdayOfMonth(year, chrono.Month.OCTOBER, chrono.Weekday.SUNDAY, 3),
      }}})
}

export const timestampCmd = {
  name: 'timestamp',
  description: 'Send a date, get the timestamp',
  type: 1,
  options: [{
    type: 3,
    name: 'date',
    description: "The date you'd like to convert to a timestamp",
    required: true
  }, {
    type: 4,
    name: 'timezone',
    description: "Which timezone to apply",
    choices: [{
      name: "UK",
      value: "0"
    }, {
      name: "Central Europe",
      value: "1"
    }, {
      name: "Turkey",
      value: "2"
    }]
  }]
}
