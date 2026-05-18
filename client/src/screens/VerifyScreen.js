import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { verifyEmail } from "../api/api";

export default function VerifyScreen({ navigation, route }) {
  const { email } = route.params;
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!code) return Alert.alert("Ошибка", "Введите код");
    setLoading(true);
    try {
      await verifyEmail(email, code.trim());
      Alert.alert("Успех", "Email подтверждён! Теперь вы можете войти.", [
        { text: "OK", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (err) {
      Alert.alert("Ошибка", err.response?.data?.error || "Неверный код");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Подтверждение email</Text>
      <Text style={styles.subtitle}>Введите код, отправленный на {email}</Text>
      <TextInput
        style={styles.input}
        placeholder="6-значный код"
        placeholderTextColor="#888"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />
      <TouchableOpacity
        style={styles.btn}
        onPress={handleVerify}
        disabled={loading}
      >
        <Text style={styles.btnText}>
          {loading ? "Проверяем..." : "Подтвердить"}
        </Text>
      </TouchableOpacity>
    </View>
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
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    color: "#aaa",
    textAlign: "center",
    marginBottom: 28,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#16213e",
    color: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    fontSize: 20,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#333",
    letterSpacing: 8,
  },
  btn: {
    backgroundColor: "#00c853",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
