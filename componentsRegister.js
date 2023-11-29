import { removeConfirmation, removeDeal, removeLoan } from "./commands/confirmations/actions.js";

export default {
  cancel_transfer: removeConfirmation,
  cancel_deal: removeDeal,
  cancel_loan: removeLoan,
}