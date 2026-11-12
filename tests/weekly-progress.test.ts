import test from "node:test";
import assert from "node:assert/strict";
import {weekStart,weeklyDiff} from "../src/helpers/weeklyProgress";
test("weekly baseline starts on Monday across month boundaries",()=>{assert.equal(weekStart("2026-11-01"),"2026-10-26");assert.equal(weekStart("2026-11-02"),"2026-11-02");});
test("weekly diff counts upward units, cleaned rules and this week’s essays only",()=>{
 const result=weeklyDiff({week:"2026-11-09",units:[{course:"il",topic:"War",status:"learning"}],missed:["a","b"]},[{course:"il",topic:"War",status:"solid"}],["b"],[{day:"2026-11-10",grade:{score:8}},{day:"2026-11-01",grade:{score:2}}] as any,"2026-11-12");
 assert.equal(result.moved[0].from,"learning");assert.deepEqual(result.cleaned,["a"]);assert.equal(result.essays,1);assert.equal(result.average,8);
});
