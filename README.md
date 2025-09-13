# Roster Loom

Roster Loom is a one-stop destination for keeping track of your various fantasy football teams across different platforms.

## Features

- **All-in-one scoreboard:** Get at-a-glance summary of who you have playing, you you're playing against, and current matchup scores
- **Multi-Platform Support:** Seamlessly connect and manage your teams from Sleeper and Yahoo Fantasy Football.
- **League-Wide Overview:** Keep track of all your leagues and teams in one place.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/fantasy-football-copilot.git
    cd fantasy-football-copilot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root of the project and add the necessary environment variables. You can use the `.env.example` file as a template.

    ```bash
    cp .env.example .env.local
    ```

    You will need to add your Supabase credentials to the `.env.local` file:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

1.  **Register for an account:**
    Go to the `/register` page to create a new account.

2.  **Log in:**
    Go to the `/login` page to log in to your account.

3.  **Integrate your fantasy football accounts:**
    - Navigate to the `/integrations` page.
    - Connect your Sleeper and/or Yahoo Fantasy Football accounts.

4.  **View your leagues and teams:**
    Once your accounts are integrated, you can view your leagues and teams on the main dashboard.

5.  **Get AI-powered recommendations:**
    Use the AI assistant to get personalized advice on your team.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.
