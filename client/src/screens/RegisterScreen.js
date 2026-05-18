import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { register } from "../api/api";

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) return Alert.alert("Ошибка", "Заполните все поля");
    if (password.length < 6)
      return Alert.alert("Ошибка", "Пароль минимум 6 символов");
    setLoading(true);
    try {
      const res = await register(email.trim(), password);
      Alert.alert("Регистрация", `Код подтверждения отправлен на почту!`, [
        {
          text: "OK",
          onPress: () => navigation.navigate("Verify", { email: email.trim() }),
        },
      ]);
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        Alert.alert(
          "Проверьте почту",
          "Запрос занял много времени, но письмо могло уйти. Проверьте почту и введите код.",
          [
            {
              text: "OK",
              onPress: () =>
                navigation.navigate("Verify", { email: email.trim() }),
            },
          ],
        );
      } else {
        Alert.alert(
          "Ошибка",
          err.response?.data?.error || "Ошибка регистрации",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Создать аккаунт</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Пароль (минимум 6 символов)"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity
        style={styles.btn}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? "Регистрируем..." : "Зарегистрироваться"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 32,
  },
  input: {
    backgroundColor: "#16213e",
    color: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  btn: {
    backgroundColor: "#00c853",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  link: { color: "#00c853", textAlign: "center", fontSize: 14 },
});
