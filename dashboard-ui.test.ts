import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(import.meta.dir, path), "utf8").replaceAll("\r\n", "\n");
const app = read("web/app.tsx");
const styles = read("web/styles.css");
const notice = read("NOTICE");

test("dashboard uses the IDFRI brand and repository links", () => {
  expect(app).toContain("function BrandMark(");
  expect(app).toContain('<div className="brand"><BrandMark />IDFRI</div>');
  expect(app).toContain('<div className="onboarding-brand"><BrandMark />IDFRI</div>');
  expect(app).toContain('href: "https://github.com/16188/aliasmode"');
  expect(app).toContain('href="https://github.com/16188/aliasmode/issues"');
  expect(app).not.toContain("NobleProxy");
  expect(app).not.toContain("CloakBrowser");
});

test("reachable navigation and profile actions are Chinese", () => {
  for (const label of ["资料", "脚本", "扩展", "代理", "回收站", "设置", "新建资料", "导入资料"]) {
    expect(app).toContain(label);
  }
  expect(app).toContain('label: "IDFRI Browser"');
  expect(app).toContain('runtime: "IDFRI Chromium 内核"');
  expect(app).toContain('label: "Firefox"');
  expect(app).toContain('runtime: "AliasMode Firefox"');
});

test("desktop update UI keeps progress and signed-update controls", () => {
  expect(app).toContain('invoke("check_for_updates")');
  expect(app).toContain('invoke("update_now", { onProgress })');
  expect(app).toContain("正在下载更新…");
  expect(app).toContain("正在验证更新…");
  expect(app).toContain("正在安装并重启…");
  expect(app).toContain('className="update-banner"');
  expect(styles).toContain(".update-progress progress");
});

test("profile forms retain proxy checking and both browser engines", () => {
  const createModal = app.slice(app.indexOf("{showCreate && ("), app.indexOf("{editId && ("));
  const editModal = app.slice(app.indexOf("{editId && ("), app.indexOf("{showBulk && ("));
  for (const modal of [createModal, editModal]) {
    expect(modal).toContain("检测代理");
    expect(modal).toContain("<ProxyCheckFeedback");
    expect(modal).toContain('value="https"');
  }
  expect(createModal).toContain('engine: "chromium", label: "IDFRI Browser", runtime: "IDFRI Chromium 内核"');
  expect(createModal).toContain('engine: "firefox", label: "Firefox", runtime: "AliasMode Firefox"');
  expect(editModal).toContain('placeholder="Asia/Kolkata"');
  expect(editModal).toContain("按代理自动设置时区");
});

test("desktop layout keeps navigation and roster usable", () => {
  expect(app).toContain('const RAIL_MEDIA = "(max-width: 760px)"');
  expect(app).toContain('className="profile-table"');
  expect(app).toContain("PAGE_SIZES = [25, 50, 100, 200]");
  expect(styles).toContain("table-layout: fixed");
  expect(styles).toContain(".sidebar.collapsed");
});

test("required license notices remain present", () => {
  expect(notice).toContain("AliasMode, Copyright 2026 Xreacher");
  expect(notice).toContain("Apache License 2.0");
  expect(notice).toContain("Mozilla Public License 2.0");
  expect(notice).toContain("SIL Open Font License");
  expect(notice).toContain("Clearcote Labs");
  expect(notice).toContain("Clearcote contributors");
  expect(notice).toContain("BSD 3-Clause License");
});
