import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import { COLORS } from '@/constants/colors';

export default function TabLayout() {
  const { loading, user } = useAuth();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let active = true;
    setRole(null);
    if (!user) return;

    getProfile(user.id)
      .then((profile) => {
        if (active) setRole(profile?.role ?? 'student');
      })
      .catch(() => {
        if (active) setRole('student');
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        // Color configuration
        tabBarActiveTintColor: '#32FC9D', // Vibrant green active tab
        tabBarInactiveTintColor: '#94A3B8', // Muted slate gray inactive tab
        
        // Header styling
        headerStyle: {
          backgroundColor: '#0B131E', // Dark background matching theme
        },
        headerTitleStyle: {
          color: '#F8FAFC', // Crisp white header text
          fontWeight: '600',
        },
        headerTintColor: '#32FC9D', // Header back button & icons
        headerShadowVisible: false,

        // Tab bar styling
        tabBarStyle: {
          backgroundColor: '#152232', // Slightly lighter dark surface for footer
          borderTopColor: '#2A3C53', // Subtle separator border
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: role === 'student' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'qr-code' : 'qr-code-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="teacher"
        options={{
          title: role === 'admin' ? 'Events' : 'Manage',
          href: role === 'teacher' || role === 'admin' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'clipboard' : 'clipboard-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: role === 'admin' ? undefined : null,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});