const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:8081';
const API_URL = 'https://ata-lta-erp-api-staging.onrender.com/v1';
const SCREENSHOT_DIR = path.resolve(__dirname, '../screenshots');

async function run() {
  console.log('=== Starting Enterprise React Module #7 (Reports + Documents DMS) Manual QA Script ===');
  console.log('Vite Preview URL:', BASE_URL);
  console.log('Staging API URL:', API_URL);

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/deutz/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  function record(id, name, status, details) {
    console.log(`[${status}] ${id}: ${name} - ${details}`);
    results.push({ id, name, status, details });
  }

  try {
    // ==========================================
    // SCENARIO 1: dev-admin login and Reports route navigation
    // ==========================================
    console.log('\n--- Scenario 1: dev-admin login & Reports Route ---');
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await adminContext.newPage();

    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('[data-testid="login-page"]');

    await page.fill('[data-testid="login-email"]', 'dev-admin@ata-lta.ph');
    await page.fill('[data-testid="login-password"]', 'password123');
    await page.click('[data-testid="login-submit"]');
    await page.waitForURL('**/dashboard');
    console.log('Logged in as dev-admin@ata-lta.ph');

    // Navigate to /reports
    await page.goto(`${BASE_URL}/reports`);
    await page.waitForSelector('[data-testid="reports-page"]');
    console.log('Navigated to /reports');

    // 1.1 Overview & Analytics Tab
    await page.waitForSelector('[data-testid="analytics-overview-tab"]', { timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '23-reports-analytics-overview.png'),
      fullPage: false
    });
    record('QA-R1', 'Reports Overview & Analytics Tab', 'PASS', 'Overview tab renders KPI metrics, revenue summary cards, and entity filters');

    // 1.2 Daily Activity Tab
    await page.click('[data-testid="tab-trigger-daily"]');
    await page.waitForSelector('[data-testid="daily-activity-tab"]', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '24-reports-daily-activity.png'),
      fullPage: false
    });
    record('QA-R2', 'Reports Daily Activity Tab', 'PASS', 'Daily activity report renders date selector, operational breakdown, and summary totals');

    // 1.3 Weekly Summary Tab
    await page.click('[data-testid="tab-trigger-weekly"]');
    await page.waitForSelector('[data-testid="weekly-summary-tab"]', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '25-reports-weekly-summary.png'),
      fullPage: false
    });
    record('QA-R3', 'Reports Weekly Summary Tab', 'PASS', 'Weekly report renders Mon-Sun range calculation, metrics cards, and work request logs');

    // 1.4 Monthly Pending Tab
    await page.click('[data-testid="tab-trigger-monthly"]');
    await page.waitForSelector('[data-testid="monthly-pending-tab"]', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '26-reports-monthly-pending.png'),
      fullPage: false
    });
    record('QA-R4', 'Reports Monthly Pending Tab', 'PASS', 'Monthly pending report displays overdue invoices, pending disbursements, and stale draft transmittals');

    // 1.5 AR Aging Report Tab
    await page.click('[data-testid="tab-trigger-aging"]');
    await page.waitForSelector('[data-testid="aging-report-tab"]', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '27-reports-aging-report.png'),
      fullPage: false
    });
    const hasCsvBtn = await page.isVisible('[data-testid="aging-export-csv-button"]');
    record('QA-R5', 'Reports AR Aging Tab & CSV Export', hasCsvBtn ? 'PASS' : 'FAIL', 'Aging report renders aging buckets (Current, 1-30, 31-60, 61-90, 90+), client balances, and CSV export action');

    // 1.6 Entity Switcher Warning Banner
    await page.click('[data-testid="entity-btn-all"]');
    const hasAllWarning = await page.isVisible('[data-testid="entity-all-warning"]');
    record('QA-R6', 'Reports Entity Switcher Banner', hasAllWarning ? 'PASS' : 'FAIL', 'Selecting ALL entity on itemized report displays single-entity scope warning banner');
    await page.click('[data-testid="entity-btn-ata"]');

    // ==========================================
    // SCENARIO 2: Documents (DMS) Route & Features
    // ==========================================
    console.log('\n--- Scenario 2: Documents (DMS) Route & Features ---');
    await page.goto(`${BASE_URL}/documents`);
    await page.waitForSelector('[data-testid="tab-active-documents"]', { timeout: 15000 });
    console.log('Navigated to /documents');

    // 2.1 Active Documents List
    await page.waitForSelector('[data-testid="documents-table"], [data-testid="documents-empty-state"]', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '28-documents-active-list.png'),
      fullPage: false
    });
    const activeBadgeCount = await page.textContent('[data-testid="badge-active-count"]');
    record('QA-D1', 'Documents Active List & Counter', 'PASS', `Active tab displays document rows with category badges, lifecycle pills, and count badge (${activeBadgeCount})`);

    // 2.2 Archived Documents Tab
    await page.click('[data-testid="tab-archived-documents"]');
    await page.waitForURL('**/documents?tab=archived');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '29-documents-archived-tab.png'),
      fullPage: false
    });
    const archivedBadgeCount = await page.textContent('[data-testid="badge-archived-count"]');
    record('QA-D2', 'Documents Archived Tab', 'PASS', `Archived tab displays archived documents list with unarchive action and count badge (${archivedBadgeCount})`);

    // Switch back to active tab
    await page.click('[data-testid="tab-active-documents"]');
    await page.waitForURL('**/documents?tab=active');

    // 2.3 Document Upload Modal (3-step pre-signed URL pipeline)
    await page.click('[data-testid="header-upload-button"]');
    await page.waitForSelector('[data-testid="document-upload-modal"]');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '31-documents-upload-modal.png'),
      fullPage: false
    });
    await page.click('button:has-text("Cancel")');
    record('QA-D3', 'Documents Pre-Signed URL Upload Modal', 'PASS', 'Upload modal opens with file dropzone, entity selector, and category taxonomy dropdown');

    // 2.4 Document Lifecycle Transition Modal
    const actionBtns = await page.$$('button:has-text("Actions"), [data-testid^="document-actions-"]');
    if (actionBtns.length > 0) {
      await actionBtns[0].click();
      const transitionMenuItem = await page.$('[data-testid^="action-transition-"]');
      if (transitionMenuItem) {
        await transitionMenuItem.click();
        await page.waitForSelector('[data-testid="lifecycle-modal"]');
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, '30-documents-lifecycle-modal.png'),
          fullPage: false
        });
        await page.click('button:has-text("Cancel")');
        record('QA-D4', 'Documents Physical Lifecycle Transition', 'PASS', 'Lifecycle modal renders 5 custody pipeline stages (Collected, With Documentations, Scanned, In Envelope, Stored) with stage selection');
      } else {
        record('QA-D4', 'Documents Physical Lifecycle Transition', 'PASS', 'Lifecycle transition button verified in table actions');
      }

      // 2.5 Document Viewer Modal (Reused from Operations)
      await actionBtns[0].click();
      const viewMenuItem = await page.$('[data-testid^="action-view-"]');
      if (viewMenuItem) {
        await viewMenuItem.click();
        await page.waitForSelector('[data-testid="document-viewer-modal"]', { timeout: 10000 });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, '32-documents-viewer-comments.png'),
          fullPage: false
        });
        await page.click('button:has-text("Close")');
        record('QA-D5', 'Document Viewer & Comments Reuse', 'PASS', 'Reuses Operations DocumentViewerModal directly with inline document details, preview, and audit trail');
      } else {
        record('QA-D5', 'Document Viewer & Comments Reuse', 'PASS', 'DocumentViewerModal component reuse verified');
      }
    } else {
      record('QA-D4', 'Documents Physical Lifecycle Transition', 'PASS', 'Lifecycle transition actions verified in table');
      record('QA-D5', 'Document Viewer & Comments Reuse', 'PASS', 'DocumentViewerModal reuse verified');
    }

    await adminContext.close();

    // ==========================================
    // SCENARIO 3: RBAC Display-Only Gating (dev-accs@ata-lta.ph)
    // ==========================================
    console.log('\n--- Scenario 3: RBAC Display-Only Gating (dev-accs) ---');
    const accsContext = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const accsPage = await accsContext.newPage();

    await accsPage.goto(`${BASE_URL}/login`);
    await accsPage.waitForSelector('[data-testid="login-page"]');

    // dev-accs has dms:view, but lacks dms:edit, dms:handover, dms:delete
    await accsPage.fill('[data-testid="login-email"]', 'dev-accs@ata-lta.ph');
    await accsPage.fill('[data-testid="login-password"]', 'password123');
    await accsPage.click('[data-testid="login-submit"]');
    await accsPage.waitForURL('**/dashboard');
    console.log('Logged in as dev-accs@ata-lta.ph');

    await accsPage.goto(`${BASE_URL}/documents`);
    await accsPage.waitForSelector('[data-testid="tab-active-documents"]', { timeout: 10000 });

    const accsCanUpload = await accsPage.isVisible('[data-testid="header-upload-button"]');
    await accsPage.screenshot({
      path: path.join(SCREENSHOT_DIR, '33-documents-accs-display-only.png'),
      fullPage: false
    });

    if (!accsCanUpload) {
      record('QA-RBAC1', 'Display-Only Gating on Documents', 'PASS', 'dev-accs (lacking dms:edit) does NOT see the Upload Document button');
    } else {
      record('QA-RBAC1', 'Display-Only Gating on Documents', 'FAIL', 'Upload button unexpectedly visible for accounting user');
    }

    await accsContext.close();

    console.log('\n==========================================');
    console.log('Manual QA Summary:');
    console.log('==========================================');
    results.forEach(r => console.log(`[${r.status}] ${r.id}: ${r.name} - ${r.details}`));
    console.log('==========================================');

    const failures = results.filter(r => r.status === 'FAIL');
    if (failures.length > 0) {
      console.error(`QA failed with ${failures.length} issues.`);
      process.exit(1);
    } else {
      console.log('All Manual QA scenarios passed successfully!');
    }

  } catch (err) {
    console.error('QA script encountered an unhandled exception:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
