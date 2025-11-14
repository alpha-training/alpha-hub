# Quiz requirements (@Irina)

Create a timed multiple choice quiz for our trainees that gives them 5 minutes to complete a quiz of 30 questions i.e. an average of 10s per question.

What we need:

* Identifies the candidate (allows them to log in / log out)
* Ability to ingest the questions in the quiz json files
* Asks the candidate a **random subset** of these questions
* Has a progress bar at the top, which shows 4/30, 5/30 etc
* Candidates can skip a question
* Wrong answers are given a score of -2
* Shows the candidate their result, and stores a history of their results for future reference
* Shows the candidate a record of their taken quizzes

## Other notes
- We don't have 30 questions yet, but we will build on this collection
- I would like us to move our FAQs quiz out of the alpha-web repo and into this alpha-hub repo, so they are completely separate