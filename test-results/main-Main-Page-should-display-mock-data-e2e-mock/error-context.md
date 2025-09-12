# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e6]:
      - generic [ref=e8]:
        - button [ref=e9] [cursor=pointer]:
          - img
        - heading "Roster Loom" [level=1] [ref=e11]
      - link "Add League" [ref=e14] [cursor=pointer]:
        - /url: /integrations
        - button "Add League" [ref=e15] [cursor=pointer]:
          - img
          - generic [ref=e16] [cursor=pointer]: Add League
    - main [ref=e17]:
      - generic [ref=e18]:
        - button "Toggle Sidebar" [ref=e19] [cursor=pointer]:
          - img
          - generic [ref=e20] [cursor=pointer]: Toggle Sidebar
        - heading "Matchup Overview" [level=2] [ref=e22]
        - button "Sign Out" [ref=e23] [cursor=pointer]
      - main [ref=e24]:
        - generic [ref=e27]: Weekly Matchups
        - generic [ref=e29]:
          - generic [ref=e31]:
            - generic [ref=e32]: My Players
            - generic [ref=e33]: "0"
          - generic [ref=e36]:
            - generic [ref=e37]: Opponent Players
            - generic [ref=e38]: "0"
  - region "Notifications (F8)":
    - list
  - alert [ref=e40]
  - button "Open Next.js Dev Tools" [ref=e46] [cursor=pointer]:
    - img [ref=e47] [cursor=pointer]
```