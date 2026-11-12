import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/<script id="register-codes">([\s\S]*?)<\/script>/);
assert.ok(match, "register code helpers should live in index.html");

const sandbox = {};
vm.runInNewContext(match[1], sandbox);
const RC = sandbox.RegisterCodes;
assert.ok(RC, "RegisterCodes should be defined");

test("new entries default to dc, and dc/ac keep their meanings", () => {
  assert.equal(RC.DEFAULT_ENTRY_CODE, "dc");
  assert.equal(
    Array.from(RC.CODE_PRESETS, function (preset) { return preset.code + "=" + preset.label; }).join(","),
    "dc=Debit card,ac=AppleCard"
  );
  assert.equal(RC.codeMeaningText("dc"), "Debit card");
  assert.equal(RC.codeMeaningText("DC"), "Debit card");
  assert.equal(RC.codeMeaningText("ac"), "AppleCard");
  assert.equal(RC.codeMeaningText("AC"), "AppleCard");
});

test("suggestions offer both codes and the next check number", () => {
  assert.equal(
    Array.from(RC.codeSuggestions([]), function (item) { return item.code + "|" + item.label; }).join(","),
    "dc|Debit card,ac|AppleCard,1001|Next check"
  );
  assert.equal(
    Array.from(RC.codeSuggestions([
      { code: "dc" },
      { code: "1008" },
      { code: "BUDGET" },
      { code: "ac" },
    ]), function (item) { return item.code; }).join(","),
    "dc,ac,1009"
  );
});

test("check numbers still increment and ignore non-numeric codes", () => {
  assert.equal(RC.nextCheckCode([]), "1001");
  assert.equal(RC.nextCheckCode([{ code: "dc" }, { code: "ac" }, { code: "BUDGET" }]), "1001");
  assert.equal(RC.nextCheckCode([{ code: "1004" }, { code: "dc" }, { code: "99" }]), "1005");
  assert.equal(RC.parseCheckNumber("1004"), 1004);
  assert.equal(RC.parseCheckNumber("dc"), null);
  assert.equal(RC.parseCheckNumber("1004a"), null);
  assert.equal(RC.parseCheckNumber(""), null);
});

test("known codes are normalized, and other values are left as typed", () => {
  assert.equal(RC.canonicalCode("dc", []), "dc");
  assert.equal(RC.canonicalCode(" DC ", []), "dc");
  assert.equal(RC.canonicalCode("ac", []), "ac");
  assert.equal(RC.canonicalCode("dc \u2014 Debit card", []), "dc");
  assert.equal(RC.canonicalCode("AC - AppleCard", []), "ac");
  assert.equal(RC.canonicalCode("1001 \u2014 Next check", []), "1001");
  assert.equal(RC.canonicalCode("1001 - Next check", []), "1001");

  const saved = [
    { code: "1004" },
    { code: "BUDGET" },
    { code: "atm" },
    { code: "1001 \u2014 rent" },
  ];
  saved.forEach(function (txn) {
    assert.equal(RC.canonicalCode(txn.code, [{ code: "50" }]), txn.code);
  });
  assert.equal(RC.canonicalCode("1004 \u2014 Next check", [{ code: "1004" }]), "1004 \u2014 Next check");
  assert.equal(RC.canonicalCode("account", []), "account");
  assert.equal(RC.canonicalCode("dc fee", []), "dc fee");
  assert.equal(RC.canonicalCode(null, []), "");
  assert.equal(RC.canonicalCode(undefined, []), "");
});

test("meanings are not invented for check numbers, budgets, or blank codes", () => {
  assert.equal(RC.codeMeaningText("1001"), "");
  assert.equal(RC.codeMeaningText("BUDGET"), "");
  assert.equal(RC.codeMeaningText("atm"), "");
  assert.equal(RC.codeMeaningText(""), "");
  assert.equal(RC.codeMeaningText(null), "");
});

test("loading a register does not rewrite stored codes", () => {
  const normalize = html.match(/function normalizeTxn\(t\) \{[\s\S]*?\n      \}/);
  assert.ok(normalize, "normalizeTxn should keep its current shape");
  assert.match(normalize[0], /code: String\(t\.code \|\| ""\)/);
  assert.doesNotMatch(normalize[0], /canonicalCode/);
  assert.doesNotMatch(html, /code:\s*nextCheckCode\(\)/);
  const defaults = html.match(/code: RegisterCodes\.DEFAULT_ENTRY_CODE/g) || [];
  assert.ok(defaults.length >= 2, "new rows should be created with the default code");
});
