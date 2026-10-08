import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { supabase } from '../app/supabase';
import { Sparkles, Mail, Lock, User, AlertCircle, CheckCircle, Info } from 'lucide-react-native';

export default function AuthScreen({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  // Cross-platform alert
  const showAlert = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    setErrorMessage(null);
    setInfoMessage(null);

    if (!trimmedEmail || !trimmedPassword) {
      setErrorMessage('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    if (trimmedPassword.length < 6) {
      setErrorMessage('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // --- ĐĂNG KÝ (SIGN UP) ---
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          throw error;
        }

        if (data?.user) {
          // Nếu có session ngay lập tức (Confirm email đã tắt)
          if (data.session) {
            const defaultUsername = username.trim() || trimmedEmail.split('@')[0];
            try {
              await supabase.from('profiles').upsert([
                {
                  id: data.user.id,
                  username: defaultUsername,
                  avatar_url: null,
                },
              ]);
            } catch (pErr) {
              console.warn('Profile init warning:', pErr);
            }

            showAlert('Thành công 🎉', 'Đăng ký tài khoản thành công! Bạn đã được đăng nhập.');
            if (onAuthSuccess) {
              onAuthSuccess(data.user);
            }
          } else {
            // Trường hợp Supabase đang BẬT "Confirm email"
            const notice =
              'Tài khoản đã tạo thành công! 🎉\n\n' +
              'LƯU Ý: Supabase đang bật xác thực email. Vui lòng kiểm tra hộp thư ' +
              trimmedEmail +
              ' để bấm link kích hoạt tài khoản.\n\n' +
              '💡 MẸO: Để đăng nhập ngay không cần email, vào Supabase Dashboard > Authentication > Providers > Email > Tắt "Confirm email".';

            setInfoMessage(notice);
            showAlert('Đã tạo tài khoản', notice);
            setIsSignUp(false); // Chuyển sang form Đăng nhập
          }
        }
      } else {
        // --- ĐĂNG NHẬP (SIGN IN) ---
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          throw error;
        }

        if (data?.user && onAuthSuccess) {
          onAuthSuccess(data.user);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      let message = err.message || 'Đã xảy ra lỗi không xác định.';

      // Phân tích các mã lỗi phổ biến của Supabase
      if (
        message.includes('over_email_send_rate_limit') ||
        message.includes('email rate limit exceeded')
      ) {
        message =
          '⚠️ LỖI QUÁ GIỚI HẠN GỬI EMAIL CỦA SUPABASE (429):\n\n' +
          'Supabase giới hạn chỉ cho gửi 3-4 email xác nhận/giờ trên gói miễn phí.\n\n' +
          '👉 CÁCH KHẮC PHỤC NGAY LẬP TỨC:\n' +
          '1. Mở trang https://supabase.com/dashboard\n' +
          '2. Vào mục Authentication -> Providers -> Email\n' +
          '3. TẮT công tắc "Confirm email" rồi bấm Save.\n' +
          'Sau khi tắt, bạn có thể đăng ký tài khoản thoải mái mà không bao giờ bị giới hạn!';
      } else if (
        message.includes('email_address_invalid') ||
        message.includes('invalid')
      ) {
        message =
          'Địa chỉ email không hợp lệ. Vui lòng nhập định dạng email thật (ví dụ: yourname@gmail.com).';
      } else if (
        message.includes('User already registered') ||
        message.includes('already exists')
      ) {
        message =
          'Email này đã được đăng ký. Bạn hãy chuyển sang tab Đăng Nhập bên dưới.';
      } else if (
        message.includes('Invalid login credentials')
      ) {
        message =
          'Email hoặc mật khẩu không chính xác. Hoặc tài khoản chưa được xác nhận email.';
      } else if (
        message.includes('Email not confirmed')
      ) {
        message =
          'Email chưa được xác nhận. Vui lòng kiểm tra hộp thư email hoặc vào Supabase tắt "Confirm email".';
      }

      setErrorMessage(message);
      showAlert('Lỗi xác thực', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Sparkles size={34} color="#000" />
          </View>
          <Text style={styles.appTitle}>Locket</Text>
          <Text style={styles.subtitle}>
            Chia sẻ ảnh trực tiếp lên màn hình chính của bạn bè
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isSignUp ? 'Tạo Tài Khoản Mới' : 'Đăng Nhập Locket'}
          </Text>

          {/* Hộp thông báo lỗi chi tiết */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <AlertCircle size={20} color="#FF453A" style={styles.boxIcon} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Hộp thông báo hướng dẫn */}
          {infoMessage && (
            <View style={styles.infoBox}>
              <Info size={20} color="#FFCC00" style={styles.boxIcon} />
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          )}

          {isSignUp && (
            <View style={styles.inputContainer}>
              <User size={18} color="#8E8E93" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Tên hiển thị (username)"
                placeholderTextColor="#666"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Mail size={18} color="#8E8E93" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email (ví dụ: user@gmail.com)"
              placeholderTextColor="#666"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrorMessage(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Lock size={18} color="#8E8E93" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Mật khẩu (ít nhất 6 ký tự)"
              placeholderTextColor="#666"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setErrorMessage(null);
              }}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isSignUp ? 'Đăng Ký Tài Khoản' : 'Đăng Nhập'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => {
              setIsSignUp((prev) => !prev);
              setErrorMessage(null);
              setInfoMessage(null);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? (
                <>Đã có tài khoản? <Text style={styles.highlightText}>Đăng Nhập</Text></>
              ) : (
                <>Chưa có tài khoản? <Text style={styles.highlightText}>Tạo Tài Khoản Mới</Text></>
              )}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 18,
  },
  errorBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderWidth: 1,
    borderColor: '#FF453A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 204, 0, 0.12)',
    borderWidth: 1,
    borderColor: '#FFCC00',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  boxIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  errorText: {
    flex: 1,
    color: '#FF453A',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  infoText: {
    flex: 1,
    color: '#FFCC00',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: '#FFCC00',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleButton: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 6,
  },
  toggleText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  highlightText: {
    color: '#FFCC00',
    fontWeight: '600',
  },
});
