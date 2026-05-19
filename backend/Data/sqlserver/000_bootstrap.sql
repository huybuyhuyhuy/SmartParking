IF DB_ID('$(DbName)') IS NULL
BEGIN
  DECLARE @createDbSql NVARCHAR(MAX) = N'CREATE DATABASE [' + REPLACE('$(DbName)', ']', ']]') + N']';
  EXEC (@createDbSql);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = '$(AppLogin)')
BEGIN
  DECLARE @createLoginSql NVARCHAR(MAX) =
    N'CREATE LOGIN [' + REPLACE('$(AppLogin)', ']', ']]') + N'] WITH PASSWORD = ''' +
    REPLACE('$(AppPassword)', '''', '''''') + N''', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
  EXEC (@createLoginSql);
END
GO

USE [$(DbName)];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$(AppLogin)')
BEGIN
  DECLARE @createUserSql NVARCHAR(MAX) =
    N'CREATE USER [' + REPLACE('$(AppLogin)', ']', ']]') + N'] FOR LOGIN [' +
    REPLACE('$(AppLogin)', ']', ']]') + N']';
  EXEC (@createUserSql);
END
GO

IF IS_ROLEMEMBER('db_datareader', '$(AppLogin)') <> 1
  ALTER ROLE db_datareader ADD MEMBER [$(AppLogin)];
GO

IF IS_ROLEMEMBER('db_datawriter', '$(AppLogin)') <> 1
  ALTER ROLE db_datawriter ADD MEMBER [$(AppLogin)];
GO

PRINT 'Database bootstrap completed.';
GO
