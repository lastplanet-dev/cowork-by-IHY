"use client";

import { useState } from "react";

export function UpgradePaymentFields() {
  const [upgrade, setUpgrade] = useState(false);

  return (
    <>
      <label className="field">
        <span>Milk-based upgrade</span>
        <input name="upgradeCoffee" type="checkbox" checked={upgrade} onChange={(event) => setUpgrade(event.target.checked)} />
      </label>
      {upgrade ? (
        <div className="field">
          <label>Payment method for upgrade</label>
          <select name="paymentMethod" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="KBZPAY">KBZPay</option>
            <option value="WAVEPAY">WavePay</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      ) : null}
    </>
  );
}
