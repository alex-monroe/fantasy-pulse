import random
import string
from playwright.sync_api import sync_playwright, Page, expect

def random_string(length=10):
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    email = f"test_{random_string()}@test.com"
    password = "password"

    # Register
    page.goto("http://localhost:9002/register")
    page.screenshot(path="jules-scratch/verification/register_page.png")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign Up").click()

    # Log in
    page.goto("http://localhost:9002/login")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign In").click()

    # Wait for navigation to the home page
    expect(page).to_have_url("http://localhost:9002/", timeout=10000)

    # Wait for the matchups to load
    expect(page.get_by_text("Weekly Matchups")).to_be_visible()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
