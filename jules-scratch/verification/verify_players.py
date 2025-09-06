from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    page.goto("http://localhost:9002/login")

    page.get_by_label("Email").fill("test@test.com")
    page.get_by_label("Password").fill("test")
    page.get_by_role("button", name="Sign In").click()

    page.wait_for_url("http://localhost:9002/")

    page.goto("http://localhost:9002/integrations")

    page.get_by_label("Sleeper Username").fill("test")
    page.get_by_role("button", name="Connect").click()

    page.goto("http://localhost:9002/")

    expect(page.get_by_text("My Players")).to_be_visible()
    expect(page.get_by_text("Opponent Players")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
