import { expect, test } from "@playwright/test";

test("sendrecv x2", async ({ browser }) => {
  const sendrecv1 = await browser.newPage();
  const sendrecv2 = await browser.newPage();

  const channelIdSuffix = crypto.randomUUID();

  await sendrecv1.goto(`http://localhost:9000/sendrecv/?channelIdSuffix=${channelIdSuffix}`);
  await sendrecv2.goto(`http://localhost:9000/sendrecv/?channelIdSuffix=${channelIdSuffix}`);

  await sendrecv1.click("#connect");
  await sendrecv2.click("#connect");

  // "connection-id" 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv1.waitForSelector("#connection-id:not(:empty)");

  // "connection-id" 要素の内容を取得
  const sendrecv1ConnectionId = await sendrecv1.$eval("#connection-id", (el) => el.textContent);
  console.log(`sendrecv1 connectionId=${sendrecv1ConnectionId}`);

  // "connection-id" 要素が存在し、その内容が空でないことを確認するまで待つ
  await sendrecv2.waitForSelector("#connection-id:not(:empty)");

  // "connection-id" 要素の内容を取得
  const sendrecv2ConnectionId = await sendrecv2.$eval("#connection-id", (el) => el.textContent);
  console.log(`sendrecv2 connectionId=${sendrecv2ConnectionId}`);

  // レース対策
  await sendrecv1.waitForTimeout(3000);
  await sendrecv2.waitForTimeout(3000);

  // page1 stats report

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendrecv1.click("#get-stats");

  // 統計情報が表示されるまで待機
  await sendrecv1.waitForSelector("#stats-report-json");
  // テキストコンテンツから統計情報を取得
  const sendrecv1StatsReportJson: Record<string, unknown>[] = await sendrecv1.evaluate(() => {
    const statsReportElement = document.querySelector("#stats-report-json") as HTMLPreElement;
    return statsReportElement ? JSON.parse(statsReportElement.textContent || "[]") : [];
  });

  const sendrecv1VideoOutboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === "outbound-rtp" && stats.kind === "video",
  );
  expect(sendrecv1VideoOutboundRtpStats).toBeDefined();
  expect(sendrecv1VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv1VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv1VideoInboundRtpStats = sendrecv1StatsReportJson.find(
    (stats) => stats.type === "inbound-rtp" && stats.kind === "video",
  );
  expect(sendrecv1VideoInboundRtpStats).toBeDefined();
  expect(sendrecv1VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv1VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  // page2 stats report

  // 'Get Stats' ボタンをクリックして統計情報を取得
  await sendrecv2.click("#get-stats");

  // 統計情報が表示されるまで待機
  await sendrecv2.waitForSelector("#stats-report-json");
  // デキストコンテンツから統計情報を取得
  const sendrecv2StatsReportJson: Record<string, unknown>[] = await sendrecv2.evaluate(() => {
    const statsReportElement = document.querySelector("#stats-report-json") as HTMLPreElement;
    return statsReportElement ? JSON.parse(statsReportElement.textContent || "[]") : [];
  });

  const sendrecv2VideoOutboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === "outbound-rtp" && stats.kind === "video",
  );
  expect(sendrecv2VideoOutboundRtpStats).toBeDefined();
  expect(sendrecv2VideoOutboundRtpStats?.bytesSent).toBeGreaterThan(0);
  expect(sendrecv2VideoOutboundRtpStats?.packetsSent).toBeGreaterThan(0);

  const sendrecv2VideoInboundRtpStats = sendrecv2StatsReportJson.find(
    (stats) => stats.type === "inbound-rtp" && stats.kind === "video",
  );
  expect(sendrecv2VideoInboundRtpStats).toBeDefined();
  expect(sendrecv2VideoInboundRtpStats?.bytesReceived).toBeGreaterThan(0);
  expect(sendrecv2VideoInboundRtpStats?.packetsReceived).toBeGreaterThan(0);

  await sendrecv1.click("#disconnect");
  await sendrecv2.click("#disconnect");

  await sendrecv1.close();
  await sendrecv2.close();
});
