from app.database import Database


class AuthCodeRepository:
    def __init__(self, database: Database) -> None:
        self.database = database
