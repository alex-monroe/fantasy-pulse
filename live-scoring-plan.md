# Live Scoring Updates Plan

This document outlines the steps to add live scoring updates to the app, making the UI interactive and exposing an API to deliver up-to-date scores for players across all integrations.

- [ ] **Design Data Flow**
  1. Identify scoring data required from each integration (e.g., Yahoo, Sleeper).
  2. Define a normalized score model that maps provider-specific fields to a common format.
  3. Decide on refresh strategy: short-interval polling, server-sent events (SSE), or WebSocket streaming.

- [ ] **Backend API**
  1. Create a service layer that fetches live scores from each integration's API.
  2. Aggregate player scores into the normalized model.
  3. Expose an endpoint (e.g., `/api/live-scores`) that returns the aggregated data.
  4. Implement caching or rate limiting to respect provider limits.

- [ ] **Real-Time Updates**
  1. Implement the chosen refresh strategy:
     - **Polling:** Schedule periodic fetches on the server and broadcast updates to clients.
     - **SSE/WebSocket:** Stream updates to connected clients when new data arrives.
  2. Add a publish/subscribe mechanism so the API can notify the UI of new scores.

- [ ] **Interactive UI**
  1. Build a scoreboard component that displays current player scores.
  2. Connect the component to the live-scoring endpoint using React hooks (e.g., `SWR` or custom hooks).
  3. Update the UI when new scores arrive without a full page reload.
  4. Show loading and error states during data fetches.

- [ ] **Integration Coverage**
  1. For each provider, implement adapters that translate provider data into the normalized model.
  2. Ensure the API endpoint aggregates scores from all enabled integrations.
  3. Add unit tests for provider adapters to confirm correct mapping.

- [ ] **Testing**
  1. Write unit tests for the service layer and UI components.
  2. Extend end-to-end tests to verify that live updates appear in the UI.
  3. Mock provider APIs in tests to simulate changing scores.

- [ ] **Deployment & Configuration**
  1. Document any new environment variables or configuration required for provider APIs.
  2. Ensure production infrastructure (e.g., Supabase, Vercel) supports the chosen real-time strategy.
  3. Monitor performance and adjust polling intervals or streaming strategies as needed.

