// КЛЮЧ ПРИЛОЖЕНИЯ — имя достаётся из самого ключа, а ключ — из ответа окна входа.

using System;
using System.Text;
using Crossade.Net;
using NUnit.Framework;

public class AccountTests
{
    string keep;

    [SetUp]
    public void Keep() => keep = Account.Key;

    [TearDown]
    public void Restore() => Account.Key = keep;

    static string KeyFor(string json) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).TrimEnd('=').Replace('+', '-').Replace('/', '_') + ".1790000000000.signature";

    [Test]
    public void NameComesFromTheKey()
    {
        Account.Key = KeyFor("{\"key\":\"tg:1\",\"name\":\"Ербол Сыздык\"}");
        Assert.AreEqual("Ербол Сыздык", Account.Name);
        Account.Key = "мусор";
        Assert.IsNull(Account.Name);
    }

    [Test]
    public void LoginAnswerGivesTheKey()
    {
        var key = KeyFor("{\"key\":\"tg:2\",\"name\":\"Проба\"}");
        Assert.IsTrue(Account.TakeLogin("crossade://login?key=" + Uri.EscapeDataString(key)));
        Assert.AreEqual(key, Account.Key);
        Assert.AreEqual("Проба", Account.Name);
        Assert.IsFalse(Account.TakeLogin(""));
    }
}
