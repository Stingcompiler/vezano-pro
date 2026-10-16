"use client";

// Gives every cell of a `table.stack-sm` a data-label with its column
// heading, so the phone layout in globals.css can show "Price  420.00"
// instead of a bare number, and copies a column's `data-cell` role from its
// <th> (lead/primary/amount/meta/status/actions) so the phone row knows
// where each cell goes. Tables re-render all the time (paging,
// filters, live data), so this watches the page and relabels on change
// rather than asking each of the 20-odd list tables to pass labels down.

import { useEffect } from "react";

function label(table) {
  const ths = [...table.querySelectorAll("thead th")];
  if (!ths.length) return;
  const heads = ths.map((th) => th.textContent.trim());
  // The column's role in the phone row (globals.css): data-cell on the <th>.
  const roles = ths.map((th) => th.getAttribute("data-cell"));
  table.querySelectorAll("tbody tr").forEach((tr) => {
    let col = 0;
    for (const td of tr.children) {
      if (td.tagName !== "TD") continue;
      const span = Number(td.getAttribute("colspan") || 1);
      if (span === 1) {
        const text = heads[col] ?? "";
        if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
        const role = roles[col];
        if (role && td.getAttribute("data-cell") !== role) td.setAttribute("data-cell", role);
      }
      col += span;
    }
  });
}

export default function TableCardLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll("table.stack-sm").forEach(label);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}
